#!/usr/bin/env python3
"""Configure or call Intent MCP without embedding credentials in campaign files."""
import argparse
import getpass
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

SERVICE = 'codex.intent.INTENT_TOKEN'
ENV = 'INTENT_TOKEN'


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, timeout=20, **kwargs)


def read_token(env_name=ENV, source='auto'):
    environment_token = os.environ.get(env_name, '').strip()
    keychain_token = ''
    if sys.platform == 'darwin' and env_name == ENV and source != 'env':
        result = run(['/usr/bin/security', 'find-generic-password', '-a', getpass.getuser(), '-s', SERVICE, '-w'])
        if result.returncode == 0:
            keychain_token = result.stdout.strip()
    if source == 'env':
        token = environment_token
    elif source == 'keychain':
        token = keychain_token
    else:
        if environment_token and keychain_token and environment_token != keychain_token:
            raise RuntimeError('Environment and Keychain contain different Intent credentials. Confirm the intended account and select --token-source env or --token-source keychain; no request was sent.')
        token = keychain_token or environment_token
    if token:
        return token
    raise RuntimeError('Intent token unavailable from the selected source. Configure your own token privately; do not put it in the CRM or skill.')


def check_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise RuntimeError('Use an HTTPS MCP endpoint without credentials, query parameters, or fragments.')
    return url


def configure(url):
    check_url(url)
    token = os.environ.get(ENV, '').strip()
    if not token:
        if not sys.stdin.isatty():
            raise RuntimeError('Run configure in an interactive terminal to enter your token privately, or supply INTENT_TOKEN in the environment.')
        token = getpass.getpass('Your Intent token (hidden): ').strip()
    if not token or any(c.isspace() for c in token):
        raise RuntimeError('Token must be nonempty and contain no whitespace.')
    if sys.platform == 'darwin':
        # security interactive mode keeps the token out of command-line arguments.
        def quote(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
        command = 'add-generic-password -U -a {} -s {} -w {}\n'.format(quote(getpass.getuser()), quote(SERVICE), quote(token))
        run(['/usr/bin/security', '-i'], input=command)
        saved = run(['/usr/bin/security', 'find-generic-password', '-a', getpass.getuser(), '-s', SERVICE, '-w'])
        if saved.returncode or saved.stdout.strip() != token:
            raise RuntimeError('Could not verify token storage in macOS Keychain.')
    elif not os.environ.get(ENV):
        raise RuntimeError('On this platform, configure INTENT_TOKEN in the Codex launch environment first; this helper does not persist plaintext tokens.')
    env = os.environ.copy()
    env[ENV] = token
    result = run(['codex', 'mcp', 'add', 'intent', '--url', url, '--bearer-token-env-var', ENV], env=env)
    if result.returncode:
        raise RuntimeError('Codex MCP registration failed; inspect local configuration without printing credentials.')
    print('Intent registered. On macOS, the helper can use Keychain immediately. Native MCP requires INTENT_TOKEN in the Codex launch environment; use launch-codex for a new CLI session. Already running apps are not changed.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token_source='auto'):
        result = run(['codex', 'mcp', 'get', 'intent', '--json'])
        if result.returncode:
            raise RuntimeError('Intent is not registered in Codex.')
        config = json.loads(result.stdout)
        transport = config.get('transport', {})
        if config.get('enabled') is False or transport.get('type') != 'streamable_http':
            raise RuntimeError('Intent must be enabled with streamable HTTP transport.')
        self.url = check_url(transport.get('url', ''))
        self.token = read_token(transport.get('bearer_token_env_var') or ENV, token_source)
        self.headers = {'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
        self.opener = urllib.request.build_opener(NoRedirect)
        self.counter = 0
        self.info = self.rpc('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'outreach-pipeline-intent', 'version': '1.0'}})
        self.headers['MCP-Protocol-Version'] = self.info['protocolVersion']
        self.rpc('notifications/initialized', notification=True)

    def rpc(self, method, params=None, notification=False):
        self.counter += 1
        payload = {'jsonrpc': '2.0', 'method': method}
        if not notification:
            payload['id'] = self.counter
        if params is not None:
            payload['params'] = params
        request = urllib.request.Request(self.url, data=json.dumps(payload).encode(), headers=self.headers)
        try:
            with self.opener.open(request, timeout=120) as response:
                session = response.headers.get('Mcp-Session-Id')
                if session:
                    self.headers['Mcp-Session-Id'] = session
                if notification:
                    return None
                if 'text/event-stream' in response.headers.get('Content-Type', ''):
                    data_lines = []
                    message = None
                    for raw in response:
                        line = raw.decode('utf-8').rstrip('\r\n')
                        if line.startswith('data:'):
                            data_lines.append(line[5:].lstrip())
                        elif not line and data_lines:
                            event = json.loads('\n'.join(data_lines))
                            data_lines = []
                            if event.get('id') == payload['id']:
                                message = event
                                break
                    if message is None:
                        raise RuntimeError('MCP stream ended without the requested result. Outcome may be unknown; do not retry blindly.')
                else:
                    message = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            # Never print request headers, response bodies that might reflect tokens, or redirects.
            raise RuntimeError('Intent HTTP {}. Check authentication for 401/403 and endpoint for 404. Requests are not automatically retried.'.format(error.code)) from None
        if 'error' in message:
            raise RuntimeError('Intent RPC error: ' + json.dumps(message['error']).replace(self.token, '[redacted]'))
        return message['result']

    def tools(self):
        tools, cursor = [], None
        while True:
            result = self.rpc('tools/list', {'cursor': cursor} if cursor else {})
            tools.extend(result.get('tools', []))
            cursor = result.get('nextCursor')
            if not cursor:
                return tools


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token-source', choices=['auto', 'env', 'keychain'], default='auto')
    commands = parser.add_subparsers(dest='command', required=True)
    setup = commands.add_parser('configure')
    setup.add_argument('--url', required=True)
    launch = commands.add_parser('launch-codex')
    launch.add_argument('codex_args', nargs=argparse.REMAINDER)
    commands.add_parser('inspect')
    call = commands.add_parser('call')
    call.add_argument('tool')
    call.add_argument('--args-file', required=True, help='JSON arguments file, or - for stdin; never a token file')
    args = parser.parse_args()
    try:
        if args.command == 'configure':
            configure(args.url)
            return
        if args.command == 'launch-codex':
            token = read_token(source=args.token_source)
            env = os.environ.copy()
            env[ENV] = token
            argv = args.codex_args
            if argv and argv[0] == '--':
                argv = argv[1:]
            os.execvpe('codex', ['codex'] + argv, env)
        client = Client(args.token_source)
        tools = client.tools()
        if args.command == 'inspect':
            output = {'server': client.info, 'tools': tools}
        else:
            if args.tool not in {tool['name'] for tool in tools}:
                raise RuntimeError('Requested tool is not exposed by this Intent server.')
            if args.args_file == '-':
                arguments = json.load(sys.stdin)
            else:
                with open(args.args_file) as handle:
                    arguments = json.load(handle)
            if not isinstance(arguments, dict):
                raise RuntimeError('Tool arguments must be a JSON object.')
            output = client.rpc('tools/call', {'name': args.tool, 'arguments': arguments})
        print(json.dumps(output, indent=2, ensure_ascii=False).replace(client.token, '[redacted]'))
        if isinstance(output, dict) and output.get('isError'):
            raise SystemExit(2)
    except subprocess.SubprocessError:
        print('Intent: a local credential/configuration command failed or timed out. Command arguments and output are withheld.', file=sys.stderr)
        raise SystemExit(1)
    except (RuntimeError, ValueError, OSError) as error:
        print('Intent: ' + str(error), file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
