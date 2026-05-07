import json
from mitmproxy import http

captured = []

class TraeCapture:
    def request(self, flow: http.HTTPFlow):
        if 'trae.ai' in flow.request.pretty_host or 'mchost.guru' in flow.request.pretty_host:
            entry = {
                'method': flow.request.method,
                'url': flow.request.pretty_url,
                'headers': dict(flow.request.headers),
                'body': flow.request.get_text()[:2000] if flow.request.get_text() else ''
            }
            captured.append(entry)
            print(f"\n{'='*60}")
            print(f"REQUEST: {entry['method']} {entry['url']}")
            print(f"HEADERS:")
            for k, v in entry['headers'].items():
                if k.lower() in ['authorization', 'x-cloudide-token', 'cookie', 'x-app-id', 'x-uid', 'x-device-id', 'x-machine-id', 'x-ide-version', 'content-type']:
                    val = v[:80] + '...' if len(v) > 80 else v
                    print(f"  {k}: {val}")
            if entry['body']:
                try:
                    body = json.loads(entry['body'])
                    print(f"BODY: {json.dumps(body, indent=2)[:500]}")
                except:
                    print(f"BODY: {entry['body'][:300]}")
            print(f"{'='*60}")

    def response(self, flow: http.HTTPFlow):
        if 'trae.ai' in flow.request.pretty_host or 'mchost.guru' in flow.request.pretty_host:
            print(f"\nRESPONSE: {flow.request.method} {flow.request.pretty_url}")
            print(f"  Status: {flow.response.status_code}")
            body = flow.response.get_text()
            if body:
                print(f"  Body: {body[:300]}")

addons = [TraeCapture()]
