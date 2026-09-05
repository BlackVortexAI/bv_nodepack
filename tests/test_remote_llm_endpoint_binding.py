import asyncio
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.request
import urllib.response

from py.util import remote_llm as remote
from test_remote_llm_provider import request

A = 'https://approved.invalid/v1/chat/completions'
B = 'https://other.invalid/v1/chat/completions'


class EndpointBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'secrets.json'
        self.paths = patch.object(remote, 'default_user_secrets_path', return_value=self.path)
        self.paths.start()
        self.addCleanup(self.paths.stop)
        self.calls = []

    def transport(self, url, headers, body, timeout):
        self.calls.append((url, headers.copy()))
        return 200, b'{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}'

    def provider(self, endpoint=A, profile='openai-compatible', cache=False):
        return remote.build_remote_provider(profile, endpoint, 'model', 'none', 5,
                                            transport=self.transport, cache_directory=cache)

    def save(self, endpoint=A, key='dummy-generic'):
        remote.set_remote_api_key('openai-compatible', key, endpoint=endpoint)

    def test_approved_key_and_endpoint_are_saved_and_used_together(self):
        self.save()
        self.provider().generate(request())
        self.assertEqual(self.calls, [(A, {'Content-Type': 'application/json', 'Accept': 'application/json',
            'User-Agent': 'BV-NodePack/Regional-Prompt-Enhancer', 'Authorization': 'Bearer dummy-generic'})])
        value = json.loads(self.path.read_text())
        self.assertEqual(value['version'], 2)
        self.assertEqual(value['endpoints'], {'openai-compatible': A})

    def test_workflow_cannot_change_host_port_or_path_or_add_query(self):
        self.save()
        for endpoint in [B, A+'/', A+'/other', A.replace('/v1/', '/V1/'),
                         A.replace('.invalid/', '.invalid:444/'), A+'?key=value',
                         'http://127.0.0.1/v1/chat/completions']:
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                self.provider(endpoint).generate(request())
        self.assertEqual(self.calls, [])

    def test_canonical_host_and_default_port_are_equivalent(self):
        self.save('https://APPROVED.invalid:443/v1/chat/completions')
        self.provider(A).generate(request())
        self.assertEqual(len(self.calls), 1)

    def test_unicode_host_and_ipv6_are_canonicalized(self):
        self.assertEqual(remote._validated_endpoint('https://bücher.invalid/a', 'test'),
                         'https://xn--bcher-kva.invalid/a')
        self.assertEqual(remote._validated_endpoint('https://[0:0:0:0:0:0:0:1]:443/a', 'test'),
                         'https://[::1]/a')

    def test_ambiguous_urls_are_rejected_at_save_without_mutation(self):
        self.save()
        before = self.path.read_bytes()
        for endpoint in [A+'#', A+'?', A+'\n', ' '+A, A+'\\other',
                         'https://name:password@approved.invalid/a',
                         'https://approved.invalid:bad/a', 'https://approved.invalid:70000/a',
                         'https://%61pproved.invalid/a', 'file:///tmp/file']:
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                self.save(endpoint)
            self.assertEqual(self.path.read_bytes(), before)

    def test_current_binding_checked_before_even_a_cache_hit(self):
        self.save()
        cache = Path(self.temp.name)/'cache'
        provider = self.provider(cache=cache)
        provider.generate(request())
        provider.generate(request())
        self.assertEqual(len(self.calls), 1)
        self.save(B, 'replacement')
        with patch.object(provider, '_read_cached_response', side_effect=AssertionError('cache must not be read')):
            with self.assertRaisesRegex(ValueError, 'not approved'):
                provider.generate(request())
        self.assertEqual(len(self.calls), 1)

    def test_mutated_provider_endpoint_is_checked_against_current_binding(self):
        self.save()
        provider = self.provider()
        provider.endpoint = B
        with self.assertRaisesRegex(ValueError, 'not approved'):
            provider.generate(request())
        self.assertFalse(self.calls)

    def test_inflight_endpoint_snapshot_is_used_for_check_cache_and_transport(self):
        self.save()
        provider = self.provider()
        def change_after_check(payload, endpoint):
            self.assertEqual(endpoint, A)
            provider.endpoint = B
            return None
        with patch.object(provider, '_cache_path', side_effect=change_after_check):
            provider.generate(request())
        self.assertEqual(self.calls[0][0], A)
        with self.assertRaisesRegex(ValueError, 'not approved'):
            provider.generate(request())
        self.assertEqual(len(self.calls), 1)

    def test_deletion_and_rotation_apply_to_existing_provider(self):
        self.save()
        provider = self.provider()
        self.save(key='rotated-dummy')
        provider.generate(request())
        self.assertEqual(self.calls[-1][1]['Authorization'], 'Bearer rotated-dummy')
        remote.delete_remote_api_key('openai-compatible')
        with self.assertRaisesRegex(ValueError, 'No API key'):
            provider.generate(request())
        self.assertEqual(len(self.calls), 1)

    def test_profiles_do_not_share_credentials(self):
        self.save()
        remote.set_remote_api_key('openai', 'dummy-openai')
        self.provider().generate(request())
        self.provider(B, 'openai').generate(request())
        self.assertEqual(self.calls[-1][0], 'https://api.openai.com/v1/chat/completions')
        self.assertEqual([item[1]['Authorization'] for item in self.calls],
                         ['Bearer dummy-generic', 'Bearer dummy-openai'])

    def test_legacy_fixed_key_works_but_generic_requires_explicit_binding(self):
        original = {'schema':'bv.remote_llm.secrets','version':1,
                    'api_keys':{'openai':'old-fixed','openai-compatible':'old-generic'}}
        self.path.write_text(json.dumps(original))
        before = self.path.read_bytes()
        self.provider(profile='openai').generate(request())
        with self.assertRaisesRegex(ValueError, 'no approved endpoint'):
            self.provider().generate(request())
        self.assertEqual(self.path.read_bytes(), before)  # reading never migrates user state
        self.save()
        self.provider().generate(request())
        self.assertEqual(json.loads(self.path.read_text())['api_keys']['openai'], 'old-fixed')

    def test_saving_another_profile_preserves_unbound_legacy_key_but_never_approves_it(self):
        self.path.write_text(json.dumps({'schema':'bv.remote_llm.secrets','version':1,
            'api_keys':{'openai-compatible':'old-generic'}}))
        remote.set_remote_api_key('venice', 'dummy-venice')
        value = json.loads(self.path.read_text())
        self.assertIsNone(value['endpoints']['openai-compatible'])
        self.assertEqual(value['api_keys']['openai-compatible'], 'old-generic')
        with self.assertRaisesRegex(ValueError, 'no approved endpoint'):
            self.provider().generate(request())

    def test_corrupt_binding_documents_fail_closed(self):
        for bindings in [{}, {'openai-compatible': 17}, {'other': A}]:
            self.path.write_text(json.dumps({'schema':'bv.remote_llm.secrets','version':2,
                'api_keys':{'openai-compatible':'dummy'},'endpoints':bindings}))
            with self.subTest(bindings=bindings), self.assertRaises(ValueError):
                self.provider().generate(request())
        self.assertFalse(self.calls)

    def test_rebinding_requires_key_reentry_and_failed_save_retains_previous_pair(self):
        self.save()
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            self.save(B, '')
        with patch.object(Path, 'replace', side_effect=OSError('simulated failure')):
            with self.assertRaises(ValueError):
                self.save(B, 'replacement')
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(list(self.path.parent.iterdir()), [self.path])

    def test_concurrent_profile_saves_do_not_drop_credentials(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda pair: remote.set_remote_api_key(*pair),
                          [('openai','dummy-a'), ('venice','dummy-b')]))
        self.assertEqual(remote.remote_api_key_status(), {'openai':True,'venice':True})

    def test_local_provider_still_works_without_credentials(self):
        self.provider('http://127.0.0.1:1234/v1/chat/completions', 'local-openai-compatible').generate(request())
        self.assertNotIn('Authorization', self.calls[0][1])
        self.assertFalse(self.path.exists())

    def test_save_route_requires_endpoint_and_key_and_never_returns_secret(self):
        decorators = SimpleNamespace(get=lambda _:lambda f:f, post=lambda _:lambda f:f, delete=lambda _:lambda f:f)
        server = SimpleNamespace(PromptServer=SimpleNamespace(instance=SimpleNamespace(routes=decorators)))
        spec = importlib.util.spec_from_file_location('py.util._binding_test_routes', Path(remote.__file__).with_name('remote_llm_routes.py'))
        routes = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'server':server}):
            spec.loader.exec_module(routes)
        async def invoke(body):
            async def read(): return body
            return await routes.remote_llm_set_api_key(SimpleNamespace(json=read))
        self.save()
        before = self.path.read_bytes()
        for body in [{'profile_id':'openai-compatible','endpoint':B},
                     {'profile_id':'openai-compatible','api_key':'dummy'}]:
            self.assertEqual(asyncio.run(invoke(body)).status, 400)
            self.assertEqual(self.path.read_bytes(), before)
        response = asyncio.run(invoke({'profile_id':'openai-compatible','api_key':'new-dummy','endpoint':B}))
        self.assertEqual(response.status, 200)
        status = asyncio.run(routes.remote_llm_providers(None))
        self.assertNotIn('new-dummy', status.text)
        self.assertIn(B, status.text)


class RedirectTests(unittest.TestCase):
    def test_real_urllib_opener_never_follows_redirects(self):
        # Real redirect dispatch, fake HTTPS handler: no sockets or servers.
        for code in [301,302,303,307,308]:
            for target in [B, A+'/other', '/relative', 'http://127.0.0.1/']:
                calls=[]
                class FakeHTTPS(urllib.request.HTTPSHandler):
                    def https_open(self, req):
                        calls.append(req.full_url)
                        headers=Message();headers['Location']=target
                        response=urllib.response.addinfourl(io.BytesIO(b''),headers,req.full_url,code)
                        response.msg='Redirect'
                        return response
                opener=urllib.request.build_opener(remote._NoRemoteRedirects(),FakeHTTPS())
                with self.subTest(code=code,target=target), patch.object(urllib.request,'build_opener',return_value=opener):
                    with self.assertRaisesRegex(remote.RemoteLLMProviderError,'redirects are blocked'):
                        remote._urllib_transport(A,{'Authorization':'Bearer dummy'},b'{}',5)
                    self.assertEqual(calls,[A])
