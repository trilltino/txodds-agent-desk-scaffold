#!/usr/bin/env python3
"""
Idle CoralOS participant for match-intelligence-agent.

The actual agent logic runs in the Tauri Rust backend. CoralOS launches this
small MCP participant so the agent appears in Coral Console and the desktop
runtime can publish its real transcript via CoralOS's puppet API.
"""

import asyncio
import os
import sys


def log(*parts):
    print("[match-intelligence-agent]", *parts, file=sys.stderr, flush=True)


async def main():
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    url = os.environ.get("CORAL_CONNECTION_URL")
    if not url:
        log("CORAL_CONNECTION_URL not set; CoralOS must launch this participant")
        sys.exit(1)

    log("connecting to CoralOS at", url)
    async with streamablehttp_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            log("connected; tools:", [tool.name for tool in tools.tools])
            log("idle; Rust desktop runtime publishes decisions through puppet API")
            await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
