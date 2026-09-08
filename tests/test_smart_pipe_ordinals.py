import json
import unittest
from py.nodes.bv_smart_pipe import BVSmartPipe

class SmartPipeOrdinalRegressionTests(unittest.TestCase):
    def test_backend_ordinals_survive_visual_reordering_and_chain_changes(self):
        names = ['model', 'clip', 'vae', 'seed', 'regional', 'latent']
        schema = [dict(id=name, name=name, ordinal=index+1) for index,name in enumerate(names)]
        values = {f'v_{index+1:03d}': {'sentinel':name} for index,name in enumerate(names)}
        route = lambda node: json.dumps(dict(nodeId=node,name=node))
        first = BVSmartPipe().run(json.dumps(schema),route('source'),**values)
        self.assertEqual(first[5], {'sentinel':'regional'})
        self.assertEqual(first[3], {'sentinel':'vae'})
        for order in [schema, list(reversed(schema)), [schema[i] for i in [0,1,2,5,3,4]]]:
            restored = json.loads(json.dumps(order))
            result = BVSmartPipe().run(json.dumps(restored),route('follower'),pipe=first[0],v_004=123)
            self.assertEqual(result[5], {'sentinel':'regional'})
            self.assertEqual(result[4],123)
            self.assertEqual(result[0]['writers']['regional'],'source')
            self.assertEqual(result[0]['writers']['seed'],'follower')
        without_seed = [slot for slot in schema if slot['id']!='seed']
        result = BVSmartPipe().run(json.dumps(without_seed),route('third'),pipe=first[0])
        self.assertIsNone(result[4])
        self.assertEqual(result[5],{'sentinel':'regional'})

if __name__ == '__main__': unittest.main()
