/* Pure, offline script provider. Replace this boundary when an AI provider is approved.
 * Input: settings. Output: editable scenes, hooks and notices. No DOM, storage or network.
 */
(function (root) {
  'use strict';
  const defaults = Object.freeze({hookType: 'surprise', postType: 'knowledge', scriptFacts: '', experienceBefore: '', experienceAction: '', experienceResult: '', productName: '', productFacts: '', adDisclosure: 'none'});
  const timings = {15: [3, 3, 3, 3, 3], 30: [3, 6, 7, 8, 6], 60: [3, 12, 17, 18, 10]};
  const hookKeys = ['surprise', 'empathy', 'question'];
  const hookLabels = ['A：ハッとする意外性', 'B：自分のことだと思う共感', 'C：続きを知りたくなる疑問'];
  const clean = (s, max = 1200) => typeof s === 'string' ? [...s.trim()].slice(0, max).join('') : '';
  const lines = text => clean(text).split(/\n+/).map(s => s.replace(/^[・\-●\s]+/, '').trim()).filter(Boolean);
  const manual = (text, hint) => clean(text) || `［${hint}］`;
  const topics = {
    aging: {
      name: '鏡に映る印象', save: '同じ条件で見返すメモに', follow: '年齢に焦らない美容の見直し', question: '鏡を見るとき、何が気になりますか？',
      hooks: ['老けた？の前に、\n光を変えて。', '朝の鏡で、\nため息が出る日。', 'その印象、\n同じ光で見た？'],
      empathy: ['朝の鏡、\n昨日と違う気がする。', '朝の鏡で、昨日と違う気がする。', '朝の鏡で、昨日と違う気がする。年齢だけで決めつけたくなりますよね。', '朝の鏡で、なんだか昨日と違う。写真に写る印象まで気になって、アイテムを増やしたくなる日もありますよね。'],
      insight: ['比べるなら、\n照明と角度もそろえる。', '比べるなら、光と角度もそろえて。', '鏡に映る印象を比べるなら、照明と顔の角度もそろえてみましょう。', '鏡や写真の印象を比べるなら、照明と顔の角度もそろえてみましょう。肌の変化を断定するためではなく、見え方の違いを確かめるためです。'],
      action: ['同じ場所で、\n気になる点をひとつメモ。', '同じ場所で、気になる点をメモ。', '明日の朝も同じ場所で鏡を見て、乾燥やつっぱりなど、気になる点をひとつメモしてみませんか。', '明日の朝も同じ明るさの場所で鏡を見て、乾燥やつっぱりなど、気になる点をひとつメモしてみませんか。気になる症状が続くなら、自己判断でケアを増やす前に専門家へ相談してください。'],
      solution: ['まずは、\n照明・角度を固定。', 'まず、鏡を見る場所をひとつ決めて。', 'まず、鏡を見る場所を決めましょう。光と角度をそろえて、見え方を比べます。', 'まず、鏡を見る場所と時間帯をひとつ決めます。同じ条件で見直してから、気になる点を言葉にしてみましょう。美容の手順を増やすかどうかは、そのあとで考えても大丈夫です。']
    },
    moisture: {
      name: '朝の保湿', save: '朝の保湿の手順を見直す日に', follow: '忙しい朝のシンプルなケア', question: '朝の保湿、何がいちばん大変ですか？',
      hooks: ['朝の保湿、\n足す前に使い方。', '保湿したいのに、\nもう出かける時間。', '朝の保湿、\n量はどう決めてる？'],
      empathy: ['メイク前、\nケアする時間が足りない。', '朝、ケアする時間が足りない。', '保湿もメイクもしたいのに、もう出かける時間。朝は慌ただしいですよね。', '保湿もメイクもしたいのに、もう出かける時間。手元のアイテムを全部使おうとして、どの順番だったか迷う朝もありますよね。'],
      insight: ['量と順番は、\n商品の案内が目安。', '量と順番は、商品の案内を目安に。', '使う量や順番は商品によって違います。多く重ねる前に、まず商品の案内を見てみましょう。', '使う量や順番は商品によって違います。たくさん重ねたからといって、自分に合うとは限りません。まず、今使っている商品の表示を確認してみましょう。'],
      action: ['今夜、朝に使うものを\n一か所にまとめる。', '今夜、朝に使うものを一か所へ。', '今夜、朝に使うものを一か所へ。使い方も確認して、朝の迷いを減らしましょう。', '今夜、朝に使うものを一か所へまとめ、使用方法を確認してみましょう。朝は肌の様子を見ながら、こすらずなじませます。合わないと感じるものは、無理に使い続けないでください。'],
      solution: ['朝の迷いは、\n前夜の準備から。', '前の晩に、朝使うものを選んでおこう。', '前の晩に、朝使うものを選んで、使い方を確認。朝の迷いを減らしましょう。', '前の晩に、朝使うものを選び、使用方法を確認しておきましょう。迷う手順があれば、商品に書かれた順番をメモに。必要以上に急がず使えるよう、自分の生活に合わせて準備します。']
    },
    serum: {
      name: '美容液選び', save: '次に美容液を選ぶときのメモに', follow: '無理なく選ぶスキンケア', question: '美容液を選ぶとき、何を重視しますか？',
      hooks: ['美容液、\n成分名だけで選ばない。', '美容液売り場で、\nまた迷ってる。', 'その美容液、\n続けられる使い方？'],
      empathy: ['種類が多くて、\n違いが分からない。', '種類が多くて、違いが分からない。', '美容液は種類が多くて、違いが分からない。選ぶとき、迷いますよね。', '美容液は種類が多くて、成分名を見ても違いが分からない。口コミを読むほど候補が増えて、予算や使い方のことまで後回しになりがちです。'],
      insight: ['成分名だけで、\n相性までは分からない。', '成分名だけで、相性は分からない。', '成分名だけで肌との相性は分かりません。使い方も一緒に確認しましょう。', '成分名だけで、自分の肌との相性や商品の使い心地までは分かりません。公式の説明、使用量、使う頻度も一緒に確認して、生活に取り入れやすいかを考えます。'],
      action: ['予算・使用頻度・使い心地。\n選ぶ基準を3つメモ。', '予算と使用頻度を、選ぶ基準に。', '予算、使う頻度、使い心地。自分の選ぶ基準を3つメモして、商品の案内と比べてみましょう。', '予算、使う頻度、好みの使い心地。この3つをメモして、商品の案内と比べてみましょう。試せない使い心地は、分からないままで大丈夫。新しいものを一度に増やさず、肌の様子も確認してください。'],
      solution: ['買う前に、\n使う頻度をチェック。', '買う前に、使う頻度と予算を確認。', '買う前に使用頻度と予算を確認。普段のケアに組み込めるかも見てみましょう。', '買う前に使用頻度と予算を確認。普段のケアに組み込めるかも見てみましょう。分からない組み合わせは推測せず、メーカーへ確認する選択もあります。']
    }
  };
  function topicFor(theme) {
    const t = clean(theme, 70);
    if (/薬|病|更年期|ホルモン|治療|診断|湿疹|アレルギー|アトピー/.test(t)) return 'manual';
    if (/老け|年齢|エイジング|鏡/.test(t) && !/保湿|美容液/.test(t)) return 'aging';
    if (/美容液|セラム/.test(t) && /選|比|買|おすすめ|使/.test(t)) return 'serum';
    if (/保湿/.test(t) && /朝|忙|時短/.test(t)) return 'moisture';
    return 'manual';
  }
  function options(input = {}) {
    const v = {...defaults, ...input};
    v.theme = clean(v.theme, 70); v.target = clean(v.target, 70);
    v.duration = [15, 30, 60].includes(Number(v.duration)) ? Number(v.duration) : 30;
    v.purpose = ['save', 'follow', 'comment', 'inform'].includes(v.purpose) ? v.purpose : 'save';
    if (!hookKeys.includes(v.hookType)) v.hookType = defaults.hookType;
    if (!['knowledge', 'solution', 'experience', 'product'].includes(v.postType)) v.postType = defaults.postType;
    if (!['none', 'PR', '広告', '商品提供'].includes(v.adDisclosure)) v.adDisclosure = 'none';
    Object.keys(defaults).filter(k => typeof defaults[k] === 'string' && defaults[k] === '').forEach(k => v[k] = clean(v[k]));
    return v;
  }
  function hooks(input) {
    const o = options(input), topic = topicFor(o.theme);
    let captions = topics[topic]?.hooks || ['［確認済み情報の意外な点を入力］', '［視聴者が実際に困る場面を入力］', '［この投稿で答える疑問を入力］'];
    if (o.postType === 'experience') captions = ['［実体験で意外だった点を入力］', '［実際に困った場面を入力］', '［実体験で確かめたかったことを入力］'];
    if (o.postType === 'product') captions = ['買う前に、\n表示をひとつ確認。', '選ぶ基準、\n増えすぎてない？', 'この商品、\nどこを見て選ぶ？'];
    return hookKeys.map((id, i) => ({id, label: hookLabels[i], caption: captions[i], narration: captions[i].replace(/\n/g, '')}));
  }
  function closing(o, t) {
    if (o.purpose === 'comment') return {caption: t?.question || 'あなたが知りたいことを、\nコメントで教えてください。', narration: t?.question || 'このテーマで、あなたが知りたいことは何ですか。よかったらコメントで教えてください。'};
    if (o.purpose === 'follow') return {caption: `${t?.follow || '頑張らない美容'}を、\nこれからも一緒に。`, narration: `${t?.follow || '無理のない美容'}を、これからも。よかったらフォローを。`};
    if (o.purpose === 'inform') return {caption: 'できそうなことを、\nひとつ選んでみて。', narration: '今日の内容から、できそうなことをひとつ選んでみてください。'};
    return {caption: `${t?.save || '今回の内容を見直す日に'}、\n保存しておこう。`, narration: `${t?.save || '今回の内容を見直すメモに'}、保存しておいてください。`};
  }
  function generate(input) {
    const o = options(input), key = topicFor(o.theme), t = topics[key], candidates = hooks(o), selected = candidates.find(h => h.id === o.hookType), level = o.duration === 15 ? 1 : o.duration === 60 ? 3 : 2;
    let middle, notice = t ? `「${t.name}」の編集用テンプレートです。個別の効果や診断を示すものではありません。` : 'このテーマは定型文の対象外です。確認済み情報を入力し、未入力箇所をご自身で編集してください。';
    if (t) {
      const empathy = [...t.empathy];
      if (key === 'moisture' && !/忙|仕事|育児|家事|時短/.test(o.target)) { empathy[0] = '朝の保湿、\n手順に迷う。'; empathy[1] = '朝の保湿、手順に迷う。'; empathy[2] = '朝の保湿、どの順番で使うか迷うことはありませんか。'; empathy[3] = '朝の保湿、どの順番で使うか迷うことはありませんか。アイテムごとの案内が違うと、自分の手順を整理しにくいですよね。'; }
      const info = o.postType === 'solution' ? t.solution : t.insight;
      middle = [[empathy[0], empathy[level]], [info[0], info[level]], [t.action[0], t.action[level]]];
    } else {
      const facts = lines(o.scriptFacts);
      middle = [['［ターゲットが困る具体的な場面を入力］', '［誰が・いつ・どんなことで困るのかを、確認できる範囲で入力］'], [manual(facts[0], '確認済み情報の要点を入力'), manual(facts[0], '出典や条件を確認した情報を入力')], [manual(facts[1], '実践できる具体的な方法を入力'), manual(facts[1], '手順・使うもの・タイミングを具体的に入力')]];
    }
    if (o.postType === 'experience') {
      middle = [[manual(o.experienceBefore, '実際に困っていたことを入力'), manual(o.experienceBefore, 'ご本人が実際に困っていた場面を入力')], [manual(o.experienceAction, '実際に試したことを入力'), manual(o.experienceAction, 'ご本人が実際に試した行動を入力')], [manual(o.experienceResult, '実際に感じたことと条件を入力'), manual(o.experienceResult, '感じたこと・期間・条件を、ご本人の言葉で入力')]];
      notice = '体験談は入力した内容だけを使います。未入力箇所は補いません。個人の体験を一般的な効果として断定しないよう確認してください。';
    }
    if (o.postType === 'product') {
      const facts = lines(o.productFacts), product = manual(o.productName, '商品名を入力');
      middle = [[`${product}\n［紹介する理由・選ぶ基準を入力］`, `${product}について、［実際に紹介したい理由を入力］`], [manual(facts[0], '表示で確認した商品情報を入力'), manual(facts[0], '容量・価格・仕様など確認済みの商品情報を入力')], [manual(facts[1], '表示で確認した使用方法を入力'), manual(facts[1], '商品に書かれた使用量・順番・注意事項を入力')]];
      notice = '商品情報は入力した内容だけを使います。効果や使用感は補いません。広告・PR・商品提供の関係に応じて表示を設定してください。';
    }
    const end = closing(o, t);
    if (o.duration === 15 && o.purpose === 'follow') end.narration = 'また一緒に、フォローで。';
    if (o.duration === 15 && o.purpose === 'comment') end.narration = key === 'serum' ? '美容液、何を重視して選ぶ？' : key === 'aging' ? '鏡で何が気になる？' : key === 'moisture' ? '朝の保湿、何が大変？' : '知りたいことをコメントで。';
    if (o.duration === 15 && o.purpose === 'save') end.narration = key === 'serum' ? '次の美容液選びに、保存を。' : key === 'aging' ? '見返すメモに、保存を。' : key === 'moisture' ? '朝の手順のメモに、保存を。' : 'あとで見返すために、保存を。';
    return {version: 1, provider: 'editable-templates', topic: key, notice, hooks: candidates, scenes: [{caption: selected.caption, narration: selected.narration}, ...middle.map(([caption, narration]) => ({caption: caption.length > 40 && !caption.includes('［') ? [...caption].slice(0, 39).join('') + '…' : caption, narration})), end].map((s, i) => ({...s, seconds: timings[o.duration][i]}))};
  }
  function warnings(scenes) {
    const result = [];
    scenes.forEach((s, i) => {
      if (/［[^］]+］/.test(s.caption + s.narration)) result.push(`${i + 1}シーン目に未入力箇所があります。`);
      if (/必ず|絶対|確実に|若返|老化を止め|シミが消|治る|治す|効果保証/.test(s.caption + s.narration)) result.push(`${i + 1}シーン目の効果・断定表現を確認してください。`);
      if ([...s.narration.replace(/\s/g, '')].length > s.seconds * 6) result.push(`${i + 1}シーン目のナレーションは秒数に対して長めです。短くするか秒数を調整してください。`);
    });
    return result;
  }
  const api = Object.freeze({defaults, options, hooks, generate, warnings});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TsumuguReelScripts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
