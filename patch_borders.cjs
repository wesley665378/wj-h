const fs = require('fs');
let code = fs.readFileSync('views/Evaluation.tsx', 'utf8');

// 1. 表格外层容器: 1px 实线边框 #e8e8e8
code = code.replace(
  'className="bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden"',
  'className="bg-white border border-[#e8e8e8] rounded-sm shadow-xs overflow-hidden"'
);

// 2. 表头底部: 2px 实线 #e0e0e0
code = code.replace(
  'className="bg-slate-50/80 border-b border-slate-200"',
  'className="bg-slate-50/80 border-b-2 border-[#e0e0e0]"'
);

// 3. 数据行及相关分割线: 1px 实线 #f0f0f0 
// 合并单元格右侧: 1px 实线 #f0f0f0
// 先把所有的 border-slate-100 和 border-slate-200 替换成 border-[#f0f0f0]，在 tbody 内部。
// 但是要注意只改表格内部的。

// 我们用正则，针对 <tbody> 到 </tbody> 之间的内容
const tbodyMatch = code.match(/<tbody>([\s\S]*?)<\/tbody>/);
if (tbodyMatch) {
  let tbodyContent = tbodyMatch[1];
  
  // 替换所有下边框、右边框、左右边框颜色
  tbodyContent = tbodyContent.replace(/border-slate-[12]00/g, 'border-[#f0f0f0]');
  
  // 4. 最后一行底部: 无线条 (last:border-b-0)
  // 当前是在 td 上写 border-b，那么如果要让最后一行没底线，
  // 我们可以给每个外层 tr 加上 group，然后 td 加上 group-last:border-b-0
  // 或者直接用 css 选择器。但是因为产专是两个 tr（React.Fragment里），而且下行才是真正的最后一行。
  // 更简单的方法：直接给 tr 加 last:border-b-0，并且把所有 bottom border 移到 tr 上，
  // 可是代码里很多 td 都有 border-b。
  // 我们可以通过给 <tbody> 加上一个特殊 className，然后用 css 控制，
  // 但这是 tailwind。
  // 也可以给所有的 tr 加上 tailwind 选择器： 
  // 对于单行： `className="... border-b border-[#f0f0f0] last:border-b-0"`
  // 并且去掉其内部 td 的 border-b。
  
  // 让我们仔细看原代码：
  // 款专 (单行)：
  // <tr key={e.userId} className="hover:bg-slate-50/70 transition-colors border-b border-slate-200">
  // 它的 td 都没有 border-b。
  // 所以我们可以改成 border-b border-[#f0f0f0] last:border-b-0
  tbodyContent = tbodyContent.replace(
    /className="hover:bg-slate-50\/70 transition-colors border-b border-\[#f0f0f0\]"/g,
    'className="hover:bg-slate-50/70 transition-colors border-b border-[#f0f0f0] last:border-b-0"'
  );
  
  // 产专 (双行)：
  // 上行 tr 没有 border-b。td 有 border-b。
  // 下行 tr 没有 border-b。td 有 border-b。
  // 我们可以把下行 tr 加上 class="... border-b border-[#f0f0f0] last:border-b-0"
  // 并且去掉下行 td 的 border-b
  
  // 下行 tr 原本是：<tr className="hover:bg-slate-50/70 transition-colors">
  // 但上行也是。
  // 我们通过替换下行的 td 去掉 border-b，放到 tr 上。
  // 或者最简单的办法：给 tbody 加上 `[&_tr:last-child_td]:border-b-0` ！
  
  code = code.replace(tbodyMatch[0], `<tbody className="[&_tr:last-child_td]:border-b-0 [&_tr:last-child]:border-b-0">\n${tbodyContent}\n</tbody>`);
}

// 修改 thead 里面的合并单元格右侧线
const theadMatch = code.match(/<thead>([\s\S]*?)<\/thead>/);
if (theadMatch) {
  let theadContent = theadMatch[1];
  theadContent = theadContent.replace(/border-slate-[12]00/g, 'border-[#f0f0f0]');
  code = code.replace(theadMatch[0], `<thead>\n${theadContent}\n</thead>`);
}

fs.writeFileSync('views/Evaluation.tsx', code);
console.log('done');
