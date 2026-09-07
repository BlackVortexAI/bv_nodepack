import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "py"))
from util.regional.edit_lora_passes import EditLoRAPasses, PASS_KEY


class EditLoraCompileTests(unittest.TestCase):
    def test_effective_stacks_clone_same_basis_and_encode_matching_clip(self):
        base, clip, image = object(), object(), object()
        stacks = {"global": [("global", 1., .5)], "left": [("global", 1., .5), ("local", .7, .2)],
                  "right": [("global", 1., .5), ("local", .7, .2)], "clip-only": [("global", 1., .8)]}
        with patch("util.regional.edit_lora_passes.apply_static_lora_stack", side_effect=[("m0","c0"),("m1","c1"),("m2","c2")]) as load, patch("util.regional.krea2_identity_edit.grounded_encode", return_value=([["p",{}]],[["n",{}]])) as encode:
            passes = EditLoRAPasses(base, clip, stacks, image)
            for scope, expected, clip_index in [("global",0,0),("left",1,1),("right",1,1),("clip-only",0,2)]:
                pos, neg = passes.encode(scope, (scope,"negative"))
                self.assertEqual(pos[0][1][PASS_KEY], expected)
                self.assertEqual(neg[0][1][PASS_KEY], expected)
                self.assertEqual(encode.call_args.args,(f"c{clip_index}",scope,"negative",image))
            self.assertEqual(load.call_count,3)
            self.assertEqual(load.call_args_list[0].args[:2],(base,clip))
            self.assertEqual(load.call_args_list[1].args[:2],(base,clip))
            self.assertEqual(load.call_args_list[2].args,(None,clip,[("global",0.,.8)]))
            self.assertEqual(load.call_args_list[1].args[2],stacks["left"])

    def test_model_only_changes_reuse_clip_and_zero_entries_reuse_both(self):
        base,clip=object(),object()
        stacks={'global':[('a',1,.5)],'other':[('a',2,.5)],'zero':[('a',1,.5),('unused',0,0)]}
        with patch('util.regional.edit_lora_passes.apply_static_lora_stack',side_effect=[('m0','c0'),('m1',None)]) as load,patch('util.regional.krea2_identity_edit.grounded_encode',return_value=([['p',{}]],[['n',{}]])) as encode:
            passes=EditLoRAPasses(base,clip,stacks,None)
            for scope in ['global','other','zero']:passes.encode(scope,('text',''))
            self.assertEqual(len(passes.models),2);self.assertEqual(len(passes.clips),1)
            self.assertEqual(load.call_count,2)
            self.assertEqual(load.call_args.args,(base,None,[('a',2.,0.)]))
            self.assertTrue(all(call.args[0]=='c0' for call in encode.call_args_list))

    def test_delegate_only_for_multiple_models_shares_one_override_and_fails_explicitly(self):
        from unittest.mock import Mock
        base=Mock();base.is_dynamic.return_value=True
        delegate=Mock();delegate.get_clone_model_override.return_value='shared'
        base.get_non_dynamic_delegate.return_value=delegate
        passes=EditLoRAPasses(base,None,{},None);passes.variant('global')
        self.assertIs(passes.prepare_model(),base);base.get_non_dynamic_delegate.assert_not_called()
        second=Mock();passes.models.append(second)
        self.assertIs(passes.prepare_model(),delegate)
        second.clone.assert_called_once_with(disable_dynamic=True,model_override='shared')
        base.get_non_dynamic_delegate.assert_called_once_with()
        self.assertEqual(passes.models,[delegate,second.clone.return_value])
        broken=EditLoRAPasses(base,None,{},None);broken.variant('global');broken.models.append(second)
        base.get_non_dynamic_delegate.side_effect=RuntimeError('missing factory')
        with self.assertRaisesRegex(RuntimeError,'missing factory'):broken.prepare_model()

    def test_global_only_path_does_not_install_wrapper(self):
        model=object()
        passes=EditLoRAPasses(model,None,{},None)
        pos,neg=[["p",{PASS_KEY:0}]],[["n",{PASS_KEY:0}]]
        self.assertIs(passes.install(model,pos,neg),model)
        self.assertNotIn(PASS_KEY,pos[0][1])


if __name__ == "__main__": unittest.main()
