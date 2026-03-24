import asyncio
import logging
from typing import Any
from core_engine.agents import Agent, AgentResult, AGENTS_REGISTRY
from core_engine.llm_client import call_llm, DEFAULT_MODEL

logger = logging.getLogger(__name__)

DEFAULT_PLAN = [["Thinker", "Psychologist"], ["Practitioner"], ["Critic"]]


async def run_tiered_plan(
    plan: list[list[str]],
    agents_registry: dict[str, Agent],
    world_state: dict[str, Any],
) -> dict[str, Any]:
    for tier_index, tier in enumerate(plan):
        logger.info(f"Executing tier {tier_index + 1}: {tier}")
        print(f"\n{'='*60}\nTier {tier_index + 1}: {tier}\n{'='*60}")

        tasks = []
        for agent_name in tier:
            agent = agents_registry.get(agent_name)
            if agent is None:
                logger.warning(f"Agent '{agent_name}' not found in registry, skipping")
                continue
            tasks.append(agent.run(world_state))

        results: list[AgentResult] = await asyncio.gather(*tasks)

        for result in results:
            world_state[result.agent_name] = result
            logger.info(f"Merged result from {result.agent_name} into world_state")

    return world_state


async def handle_query_stream(
    query: str,
    user_id: str = "anonymous",
    plan: list[list[str]] | None = None,
):
    """Async generator yielding progress events as each agent completes."""
    world_state: dict[str, Any] = {"query": query, "user_id": user_id}
    active_plan = plan or DEFAULT_PLAN
    total = sum(len(t) for t in active_plan)

    yield {"type": "start", "total": total}

    for tier_index, tier in enumerate(active_plan):
        logger.info(f"Executing tier {tier_index + 1}: {tier}")
        yield {"type": "tier_start", "tier": tier_index + 1, "agents": tier}

        tasks = []
        for agent_name in tier:
            agent = AGENTS_REGISTRY.get(agent_name)
            if agent:
                tasks.append(agent.run(world_state))

        results: list[AgentResult] = await asyncio.gather(*tasks)
        for result in results:
            world_state[result.agent_name] = result
            logger.info(f"Merged result from {result.agent_name} into world_state")
            yield {"type": "agent_done", "agent": result.agent_name, "content": result.content}

    yield {"type": "synthesizing"}
    summary = await _synthesize_results(world_state)

    yield {
        "type": "final",
        "answer": summary,
        "details": {
            "analysis": _get_content(world_state, "Thinker"),
            "plan": _get_content(world_state, "Practitioner"),
            "critique": _get_content(world_state, "Critic"),
            "psychology": _get_content(world_state, "Psychologist"),
        },
    }


async def handle_query(
    query: str,
    user_id: str = "anonymous",
    plan: list[list[str]] | None = None,
) -> dict[str, Any]:
    logger.info(f"handle_query user_id={user_id} query_length={len(query)}")
    print(f"\n{'#'*60}\nNew Query from {user_id}:\n{query}\n{'#'*60}")

    world_state: dict[str, Any] = {
        "query": query,
        "user_id": user_id,
    }

    active_plan = plan or DEFAULT_PLAN
    world_state = await run_tiered_plan(active_plan, AGENTS_REGISTRY, world_state)

    summary = await _synthesize_results(world_state)

    return {
        "answer": summary,
        "details": {
            "analysis": _get_content(world_state, "Thinker"),
            "plan": _get_content(world_state, "Practitioner"),
            "critique": _get_content(world_state, "Critic"),
            "psychology": _get_content(world_state, "Psychologist"),
        },
    }


def _get_content(world_state: dict[str, Any], agent_name: str) -> str | None:
    result = world_state.get(agent_name)
    if isinstance(result, AgentResult):
        return result.content
    return None


async def _synthesize_results(world_state: dict[str, Any]) -> str:
    query = world_state.get("query", "")

    parts = []
    for agent_name in ["Thinker", "Psychologist", "Practitioner", "Critic"]:
        content = _get_content(world_state, agent_name)
        if content:
            parts.append(f"[{agent_name}]:\n{content}")

    if not parts:
        return "No results generated."

    combined = "\n\n".join(parts)

    synthesis_messages = [
        {
            "role": "system",
            "content": (
                "You are an expert synthesizer. Your job is to combine insights from multiple "
                "specialist agents into a single coherent, integrated recommendation. "
                "Preserve the key insights from each agent while creating a unified narrative."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Original Query: {query}\n\n"
                f"Agent Responses:\n{combined}\n\n"
                "Please synthesize these perspectives into a single, integrated answer that "
                "is clear, actionable, and addresses the original query comprehensively."
            ),
        },
    ]

    logger.info("Synthesizing final answer from all agent results")
    summary = await call_llm(synthesis_messages, DEFAULT_MODEL)
    print(f"\n{'#'*60}\nFinal Synthesized Answer:\n{summary}\n{'#'*60}")
    return summary
