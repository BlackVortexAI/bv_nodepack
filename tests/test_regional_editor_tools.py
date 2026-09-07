import copy
import unittest
import uuid

from py.util.regional.document import default_document, parse_document, selection_prompts
from py.util.regional.context import normalize_context, context_document
from py.util.regional.tool_settings import filter_tool_config
from py.util.regional.reference_registry import build_reference_provider
import torch


class RegionalEditorToolsTests(unittest.TestCase):
    def test_tools_filter_execution_without_losing_source_config(self):
        document = default_document()
        document['tool_settings'] = {'lora': False, 'lut': False}
        document['regions'] = [{'id': 'r', 'tool_settings': {'lora': True, 'lut': True}}]
        lora = {'version': 3, 'entries': [{'id': 'a', 'targets': [{'scope': 'global'}, {'scope': 'region', 'region_id': 'r'}]}]}
        saved = copy.deepcopy(lora)
        self.assertEqual(filter_tool_config(document, lora, 'lora')['entries'][0]['targets'], [{'scope': 'region', 'region_id': 'r'}])
        self.assertEqual(lora, saved)
        lut = {'version': 1, 'jobs': [{'id': 'g', 'scope': 'global'}, {'id': 'r', 'scope': 'regional', 'region_ids': ['r']}]}
        self.assertEqual([j['id'] for j in filter_tool_config(document, lut, 'lut')['jobs']], ['r'])
        document.pop('tool_settings')
        self.assertEqual(filter_tool_config(document, lora, 'lora'), lora)

    def test_mentions_roundtrip_and_block_application_but_not_authoring(self):
        document = default_document(); document['tool_settings'] = {'lut': False}
        pair = document['prompts']['global']; pair['positive_source'] = '👩 @Image 1 walks'
        pair['reference_editor'] = False
        pair['references'] = {'positive': [{'start': 3, 'end': 11, 'label': '@Image 1', 'collector_id': str(uuid.uuid4()), 'resource_id': str(uuid.uuid4())}]}
        self.assertEqual(context_document(normalize_context(document)), document)
        with self.assertRaisesRegex(ValueError, 'does not support'):
            selection_prompts({'document': document, 'scope': 'global', 'region_id': None})
        pair['references']['positive'][0]['end'] = 12
        with self.assertRaises(ValueError):
            parse_document(document)
        pair.pop('references'); pair['positive_source'] = '@artist woman'
        self.assertEqual(selection_prompts({'document': document, 'scope': 'global', 'region_id': None})[0]['source'], '@artist woman')

    def test_vacant_places_and_new_source_preserve_identity(self):
        places = [{'id': str(uuid.uuid4()), 'slot': 'media0'}, {'id': str(uuid.uuid4()), 'slot': 'media1'}]
        config = {'schema': 'bv.reference_registry_config', 'version': 1, 'collector_id': str(uuid.uuid4()), 'places': places, 'entries': [places[1]]}
        image = torch.ones(1, 2, 2, 3)
        provider = build_reference_provider(config, {'media1': image})
        self.assertEqual(list(provider['resources']), [places[1]['id']])
        config['entries'] = places
        replacement = torch.zeros_like(image)
        provider = build_reference_provider(config, {'media0': replacement, 'media1': image})
        self.assertIs(provider['resources'][places[0]['id']], replacement)

    def test_regional_node_tool_switches_preserve_drafts_and_restore_capabilities(self):
        import json
        from test_regional_nodes import load_node_module, fixture
        module = load_node_module()
        document = fixture(); document['version'] = 2
        for region in document['regions']:
            region['usage'] = 'generation'
        region = document['regions'][0]
        collector = str(uuid.uuid4())
        entry = {'id': str(uuid.uuid4()), 'source': {'kind': 'external', 'collector_id': collector, 'resource_id': 'skin'}, 'targets': [{'scope': 'global'}]}
        lora = json.dumps({'version': 3, 'entries': [entry], 'steps': []})
        lut = json.dumps({'version': 1, 'jobs': [{'id': 'grade', 'region_ids': [region['id']], 'mask_composition': 'union', 'lut_source': {'collector_id': collector, 'resource_id': 'warm'}, 'strength': .5, 'mask_invert': False, 'detector_source': None}]})
        provider = module.build_lora_provider(collector, {'skin': {'id': 'skin', 'name': 'Skin', 'stack': [['skin.safetensors', .8, .6]]}})
        for enabled in (True, False, True):
            document['tool_settings'] = {'lora': enabled}
            region['tool_settings'] = {'lut': enabled}
            result, _ = module.BVRegionalPromptNode().build(json.dumps(document), lora_v3_config_json=lora, lut_v3_config_json=lut, resource_provider_1=provider)
            capabilities = result.get('capabilities', {})
            self.assertEqual(bool(capabilities.get('bv-nodepack.lora', {}).get('entries')), enabled)
            self.assertEqual(bool(capabilities.get('bv-nodepack.lut-plan', {}).get('jobs')), enabled)
        self.assertEqual(json.loads(lora)['entries'], [entry])

    def test_disconnected_image_keeps_following_display_number(self):
        places = [{'id': str(uuid.uuid4()), 'slot': f'media{i}', 'media_type': 'IMAGE'} for i in range(2)]
        config = {'schema': 'bv.reference_registry_config', 'version': 1, 'collector_id': str(uuid.uuid4()), 'places': places, 'entries': [places[1]]}
        provider = build_reference_provider(config, {'media1': torch.zeros(1, 2, 2, 3)})
        self.assertEqual(provider['metadata'][places[1]['id']]['name'], 'Image 2')

    def test_reference_place_capacity_includes_vacancies(self):
        places = [{'id': str(uuid.uuid4()), 'slot': f'media{i}'} for i in range(101)]
        config = {'schema': 'bv.reference_registry_config', 'version': 1, 'collector_id': str(uuid.uuid4()), 'places': places, 'entries': []}
        with self.assertRaisesRegex(ValueError, 'at most 100'):
            build_reference_provider(config, {})
