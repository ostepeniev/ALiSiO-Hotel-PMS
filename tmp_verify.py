import json, urllib.request
r = urllib.request.urlopen('https://alisio.swipescape.eu/api/guest/usajax7e5m1x')
d = json.loads(r.read())
cfg = d.get('guestPageConfig', {})
print('WiFi network:', cfg.get('wifi_network'))
print('WiFi password:', cfg.get('wifi_password'))
print('Translations count:', len(d.get('translations', {})))
tr_sample = list(d.get('translations', {}).items())[:3]
for k, v in tr_sample:
    print(f'  [{k[:40]}] en={v.get("en","?")[:40]}')
