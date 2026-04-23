import sys, json
d = json.load(sys.stdin)
rg = d.get("registeredGuests", [])
print(f"registeredGuests: {len(rg)}")
for g in rg:
    print(f"  - {g.get('first_name')} {g.get('last_name')}")
