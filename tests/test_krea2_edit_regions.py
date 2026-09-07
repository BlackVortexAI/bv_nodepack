import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import torch
sys.path.insert(0,str(Path(__file__).parents[1]/"py"))
from util.regional import krea2_edit_regions as subject
from util.regional.document import default_document

def region(identifier,text,strength=1.,usage="generation"):
    return {"id":identifier,"name":identifier,"enabled":True,"usage":usage,"strength":strength,
            "prompts":{"positive_source":text,"negative_source":""}}

class RegionalEditTests(unittest.TestCase):
    def setUp(self):
        self.doc=default_document();self.doc["canvas"]={"width":4,"height":2}
        self.doc["reference_images"]=[{"collector_id":"source","resource_id":"image"}]
        self.doc["prompts"]["global"]["positive_source"]="Preserve identities."
        self.image=torch.zeros(1,2,4,3)
        self.masks={"left":torch.tensor([[[1.,1.,0.,0.]]]).expand(1,2,4),"right":torch.tensor([[[0.,0.,1.,1.]]]).expand(1,2,4)}
        mocked=patch.object(subject,"render_selection",side_effect=lambda selection,w,h:self.masks[selection["region_id"]]);mocked.start();self.addCleanup(mocked.stop)
        self.calls=[]
        def encode(clip,pos,neg,image):
            self.calls.append((pos,neg,image))
            return [[torch.ones(1,2,3),{}]],[[torch.zeros(1,1,3),{}]]
        mocked=patch.object(subject,"grounded_encode",side_effect=encode);self.encode=mocked.start();self.addCleanup(mocked.stop)
    def test_two_regions_and_cfg_masks_no_crop(self):
        self.doc["regions"]=[region("left","Blonde hair."),region("right","Red hair.")]
        before=copy.deepcopy(self.doc)
        pos,neg=subject.compile_edit_regions(self.doc,None,self.image)
        self.assertEqual(len(pos),2)
        self.assertEqual([call[0] for call in self.calls],["Preserve identities.\nBlonde hair.","Preserve identities.\nRed hair."])
        for (p,n),key in zip(zip(pos,neg),["left","right"]):
            self.assertTrue(torch.equal(p[1]["mask"],self.masks[key].unsqueeze(1)))
            self.assertIs(p[1]["mask"],n[1]["mask"])
            self.assertNotIn("area",p[1]);self.assertFalse(p[1]["set_area_to_bounds"])
        self.assertTrue(all(call[2] is self.image for call in self.calls))
        self.assertEqual(self.doc,before)
    def test_strength_and_overlap_keep_global_coverage(self):
        self.masks["right"]=self.masks["left"]
        self.doc["regions"]=[region("left","Blonde",.5),region("right","Red",.25)]
        pos,_=subject.compile_edit_regions(self.doc,None,self.image)
        masks=[item[1]["mask"] for item in pos]
        self.assertTrue(torch.equal(masks[0],1.-self.masks["left"].unsqueeze(1)*.5))
        self.assertTrue(torch.all(sum(masks)>0))
        self.doc["regions"][1]["strength"]=2.
        pos,_=subject.compile_edit_regions(self.doc,None,self.image)
        self.assertEqual(pos[-1][1]["mask"].max(),2.)
    def test_disabled_detailer_empty_zero_masks_and_strength_preserve_global_path(self):
        for item in [region("left","",1),region("left","Blonde",0),region("left","Blonde",1,"detailer"),{**region("left","Blonde"),"enabled":False}]:
            self.doc["regions"]=[item]
            pos,_=subject.compile_edit_regions(self.doc,None,self.image)
            self.assertNotIn("mask",pos[0][1])
        self.masks["left"]=torch.zeros(1,2,4)
        self.doc["regions"]=[region("left","Blonde")]
        pos,_=subject.compile_edit_regions(self.doc,None,self.image)
        self.assertNotIn("mask",pos[0][1])
    def test_lora_only_region_keeps_mask_and_uses_scope_encoder(self):
        self.doc["regions"]=[region("left","")]
        calls=[]
        def encode(scope,text,*,entries=None):
            calls.append((entries,text))
            return subject.grounded_encode(None,*text,self.image)
        pos,neg=subject.compile_edit_regions(self.doc,None,self.image,scope_encoder=encode,lora_scopes={"left":[("local",1,0)]})
        self.assertEqual([entries for entries,_ in calls],[[],[("local",1,0)]])
        self.assertEqual(len(pos),2)
        self.assertTrue(torch.equal(pos[1][1]["mask"],self.masks["left"].unsqueeze(1)))

    def compile_stacks(self,stacks):
        def encode(scope,text,*,entries=None):
            entries=stacks.get(scope,stacks.get("global",[])) if entries is None else entries
            return ([[torch.ones(1),{"text":text,"stack":entries}]],[[torch.zeros(1),{"text":text,"stack":entries}]])
        return subject.compile_edit_regions(self.doc,None,self.image,scope_encoder=encode,lora_scopes=stacks)

    def test_full_overlap_combines_blonde_prompt_and_lora_without_competing_pass(self):
        self.masks['right']=self.masks['left']
        self.doc['regions']=[region('left','Blonde'),region('right','')]
        pos,neg=self.compile_stacks({'right':[('skin',5,0)]})
        selected=[p[1] for p in pos if p[1]['mask'][0,0,0,0]>0]
        self.assertEqual(len(selected),1)
        self.assertEqual(selected[0]['text'],('Preserve identities.\nBlonde',''))
        self.assertEqual(selected[0]['stack'],[('skin',5,0)])
        self.assertEqual(selected[0]['mask'][0,0,0,0],1)
        for p,n in zip(pos,neg):self.assertIs(p[1]['mask'],n[1]['mask'])

    def test_partial_overlay_preserves_prompt_weights_and_global_coverage(self):
        self.masks['right']=torch.tensor([[[0.,1.,1.,0.]]]).expand(1,2,4)
        self.doc['regions']=[region('left','Blonde'),region('right','')]
        pos,_=self.compile_stacks({'right':[('skin',5,0)]})
        self.assertTrue(torch.equal(sum(p[1]['mask'] for p in pos),torch.ones(1,1,2,4)))
        for x in range(4):
            selected=[p[1] for p in pos if p[1]['mask'][0,0,0,x]>0]
            self.assertEqual(len(selected),1)
            self.assertEqual(bool(selected[0]['stack']),x in (1,2))
            self.assertEqual('Blonde' in selected[0]['text'][0],x<2)

    def test_soft_overlay_strength_clamps_without_changing_prompt_total(self):
        self.masks['right']=torch.full((1,2,4),.5)
        self.doc['regions']=[region('left','Blonde',2),region('right','')]
        for strength in [0.,.5,2.]:
            self.doc['regions'][1]['strength']=strength
            pos,_=self.compile_stacks({'right':[('skin',5,0)]})
            total=sum(p[1]['mask'] for p in pos)
            self.assertTrue(torch.equal(total,torch.tensor([[[[2.,2.,1.,1.],[2.,2.,1.,1.]]]])))
            weighted=sum((p[1]['mask'] for p in pos if p[1]['stack']),torch.zeros_like(total))
            self.assertTrue(torch.equal(weighted,total*min(.5*strength,1)))

    def test_multiple_overlays_intersect_with_global_once_and_explicit_duplicates(self):
        a=('base',1,.5);b=('skin',5,0);c=('style',.7,0)
        self.assertEqual(subject.merge_edit_stacks([a,b,b],[a,b,b,c],[a]),[a,b,b,c])
        self.assertEqual(subject.merge_edit_stacks([a],[a,a],[a]),[a,a])
        self.assertEqual(subject.merge_edit_stacks([a,b],[a,('skin',2,0)],[a]),[a,b,('skin',2,0)])
        self.masks['left']=torch.tensor([[[1.,1.,0.,0.]]]).expand(1,2,4)
        self.masks['right']=torch.tensor([[[0.,1.,1.,0.]]]).expand(1,2,4)
        self.doc['regions']=[region('left',''),region('right','')]
        pos,_=self.compile_stacks({'global':[a],'left':[a,b],'right':[a,c]})
        for x,expected in enumerate([[a,b],[a,b,c],[a,c],[a]]):
            selected=[p[1] for p in pos if p[1]['mask'][0,0,0,x]>0]
            self.assertEqual(len(selected),1);self.assertEqual(list(map(tuple,selected[0]['stack'])),expected)

    def test_identical_overlay_assignments_merge_without_double_strength(self):
        self.masks['left']=self.masks['right']=torch.full((1,2,4),.5)
        self.doc['regions']=[region('left',''),region('right','')]
        pos,_=self.compile_stacks({'left':[('skin',1,0)],'right':[('skin',1,0)]})
        self.assertEqual(len(pos),2)
        self.assertTrue(torch.equal(sum(p[1]['mask'] for p in pos),torch.ones(1,1,2,4)))
        self.assertEqual(max(len(p[1]['stack']) for p in pos),1)

    def test_combinations_limit_precedes_any_encoding(self):
        stacks={};self.doc['regions']=[]
        for i in range(7):
            key=str(i);self.masks[key]=torch.full((1,2,4),.5)
            self.doc['regions'].append(region(key,''));stacks[key]=[(key,1,0)]
        calls=[]
        def encode(*args,**kwargs):calls.append(args);return ([[torch.ones(1),{}]],[[torch.ones(1),{}]])
        with self.assertRaisesRegex(ValueError,'64'):
            subject.compile_edit_regions(self.doc,None,self.image,scope_encoder=encode,lora_scopes=stacks)
        self.assertFalse(calls)
        self.doc['regions'].pop()
        pos,_=subject.compile_edit_regions(self.doc,None,self.image,scope_encoder=encode,lora_scopes=stacks)
        self.assertEqual(len(pos),64)

if __name__=="__main__":unittest.main()
