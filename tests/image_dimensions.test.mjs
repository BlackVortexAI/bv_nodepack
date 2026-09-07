import test from 'node:test';
import assert from 'node:assert/strict';
import {observeImageDimensions} from '../ui/src/ui/imageDimensions.ts';
test('image dimension reads reject late results after source switch and cleanup',()=>{
 const old={},next={},values=[];const cancel=observeImageDimensions('old',value=>values.push(value),()=>old);const late=old.onload;cancel();
 observeImageDimensions('new',value=>values.push(value),()=>next);old.naturalWidth=900;old.naturalHeight=800;late();assert.deepEqual(values,[]);
 next.naturalWidth=736;next.naturalHeight=920;next.onload();assert.deepEqual(values,[{width:736,height:920}]);next.onerror();assert.equal(values.at(-1),null);
});
test('zero dimension images do not offer a canvas size',()=>{const img={},values=[];observeImageDimensions('broken',v=>values.push(v),()=>img);img.naturalWidth=0;img.naturalHeight=0;img.onload();assert.deepEqual(values,[null]);});
