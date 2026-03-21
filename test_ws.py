import asyncio
import websockets
import json
import httpx

async def test_ws():
    # 1. Create table
    print("Creating table...")
    async with httpx.AsyncClient() as client:
        resp = await client.post("http://localhost:8000/tables", json={"small_blind": 25, "big_blind": 50})
        table_id = resp.json()["table_id"]
        print(f"Created table {table_id}")

    # 2. Connect 2 clients
    print("Connecting clients...")
    uri1 = f"ws://localhost:8000/ws/{table_id}/client_1"
    uri2 = f"ws://localhost:8000/ws/{table_id}/client_2"
    
    async with websockets.connect(uri1) as ws1, websockets.connect(uri2) as ws2:
        print("Connected.")
        state = await ws1.recv()
        print("Initial state from ws1:", json.loads(state)["players"])
        
        # Second broadcast from ws2 connecting
        state = await ws1.recv()
        print("State from ws1 after ws2 connects:", json.loads(state)["players"])
        
        # Both connected. Send start from ws1
        print("Sending start...")
        await ws1.send(json.dumps({"action": "start"}))
        
        # Receive update
        state = await ws1.recv()
        state_dict = json.loads(state)
        print("State after start. Phase:", state_dict["phase"])

asyncio.run(test_ws())
