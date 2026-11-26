import * as THREE from '../grasp-explorer-v2/vendor/three.module.js';
// Deterministic texture generated locally, inspired by the small game's canvas textures.
// Only appearance changes; node transforms and replay data are untouched.
export function applyProceduralSurfaces(root) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); let seed = 137;
  const rand = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
  ctx.fillStyle = '#ded8ca'; ctx.fillRect(0, 0, 128, 128);
  for(let i=0;i<350;i++){ctx.fillStyle=`rgba(80,60,30,${rand()*.08})`;ctx.fillRect(rand()*128,rand()*128,12+rand()*55,.5);}
  ctx.strokeStyle='rgba(75,60,40,.13)';ctx.lineWidth=.5;
  for(let y=0;y<128;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();}
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  root.traverse(node => {
    if(!node.isMesh)return;
    let parent=node, isFloor=false; while(parent){if(/_floor(?:_|$)/i.test(parent.name))isFloor=true;parent=parent.parent;}
    if(!isFloor)return;
    const pos=node.geometry.attributes.position; if(!pos)return;
    const normal=node.geometry.attributes.normal;const axes=[0,1,2].sort((a,b)=>{
      const box=node.geometry.boundingBox || (node.geometry.computeBoundingBox(),node.geometry.boundingBox);return (box.max.getComponent(b)-box.min.getComponent(b))-(box.max.getComponent(a)-box.min.getComponent(a));
    });
    const uv=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){uv[i*2]=pos.array[i*3+axes[0]]*.8;uv[i*2+1]=pos.array[i*3+axes[1]]*.8;}
    node.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    node.material=(Array.isArray(node.material)?node.material:[node.material]).map(mat=>{const m=mat.clone();m.map=texture;m.roughness=.85;return m;});if(node.material.length===1)node.material=node.material[0];
  });
}
