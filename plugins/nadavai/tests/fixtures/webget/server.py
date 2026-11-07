"""Local test server for test-webget.sh: serves this directory plus /hang, /captcha and /404.
Usage: python server.py <port>"""
import http.server, os, socketserver, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)

    def log_message(self, *a):
        pass

    def send_page(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode())

    def do_GET(self):
        if self.path.startswith("/hang"):
            time.sleep(300)  # never answers within webget's limits
        elif self.path.startswith("/captcha"):
            para = "A long real paragraph about how a captcha works and why people hate solving them. " * 30
            self.send_page(200, f"<html><head><title>Why CAPTCHA tests fail</title></head><body><article>"
                                f"<h1>Essay about CAPTCHA</h1><p>{para}</p></article></body></html>")
        elif self.path.startswith("/404"):
            self.send_page(404, "<html><head><title>Not found</title></head><body><p>"
                                + "This page does not exist anymore, try the home page instead. " * 5 + "</p></body></html>")
        else:
            super().do_GET()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


Server(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
