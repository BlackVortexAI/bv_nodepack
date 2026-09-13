import assert from 'node:assert/strict';
import test from 'node:test';
import {PopoverScope} from '../ui/src/ui/components/popoverScope.ts';

test('portalled dropdown belongs to its settings popover before option click',()=>{
    const parent=new PopoverScope(),child=new PopoverScope(parent),grandchild=new PopoverScope(child);
    const panel={},option={},deep={};
    const remove=child.register(panel),removeDeep=grandchild.register(deep);
    const parentPanel={};parent.register(parentPanel);
    assert.equal(child.contains([parentPanel]),false);
    assert.equal(parent.contains([parentPanel]),true);
    assert.equal(parent.contains([option,panel]),true);
    assert.equal(child.contains([option,panel]),true);
    assert.equal(parent.contains([deep]),true);
    assert.equal(parent.contains([{}]),false);
    assert.equal(new PopoverScope().contains([panel]),false);
    assert.equal(new PopoverScope(parent).contains([panel]),false);
    remove();removeDeep();
    assert.equal(parent.contains([panel,deep]),false);
    const reopened={};const closeAgain=child.register(reopened);
    assert.equal(parent.contains([reopened]),true);
    assert.equal(parent.contains([panel]),false);
    closeAgain();assert.equal(parent.contains([reopened]),false);
});
