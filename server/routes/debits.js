const express = require('express');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const router = express.Router();

function readGinkouFile() {
  // プロジェクト直下の ginkou.csv を参照
  const csvPath = path.resolve(__dirname, '..', '..', 'ginkou.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`ファイルが見つかりません: ${csvPath}`);
  }
  const buf = fs.readFileSync(csvPath);
  // Windows系の銀行データは CP932 (Shift_JIS互換) が安全
  const text = iconv.decode(buf, 'CP932');
  // 改行を正規化
  return text.replace(/\r\n/g, '\n').split('\n').filter(l => l.length > 0);
}

function lastDigitRun(line) {
  // 末尾から連続する数字（例: 金額候補）を抽出
  const m = line.match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

// プレビュー: 先頭50行の概要
router.get('/preview', (req, res) => {
  try {
    const rawLines = readGinkouFile();

    const previewLines = rawLines.slice(0, 50).map((l, i) => {
      const recordType = l.charAt(0) || '';
      const amountCandidate = lastDigitRun(l);
      return {
        idx: i + 1,
        recordType,
        length: l.length,
        amountCandidate,
        sample: l
      };
    });

    const recordTypeCounts = rawLines.reduce((acc, l) => {
      const t = l.charAt(0) || '';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    res.json({
      encoding: 'CP932',
      totalLines: rawLines.length,
      recordTypeCounts,
      previewLines
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// 解析: 名前推定と金額合計
router.get('/parse', (req, res) => {
  try {
    const lines = readGinkouFile();
    const dataLines = lines.filter(l => (l.charAt(0) || '') === '2');

    // 半角カナの連続ブロックを名前候補として抽出
    const kanaRegex = /[｡-ﾟ\s]+/; // 半角カナと空白
    const parsed = dataLines.slice(0, 200).map((l, i) => {
      const amount = lastDigitRun(l);
      // 名前候補: 最大の半角カナ連続部分を選ぶ
      let nameCandidate = '';
      const segments = l.split(/\s{2,}/).filter(s => s.length > 0);
      let bestScore = -1;
      for (const seg of segments) {
        const kanaCount = (seg.match(/[｡-ﾟ]/g) || []).length;
        if (kanaCount > bestScore) {
          bestScore = kanaCount;
          nameCandidate = seg.trim();
        }
      }
      return {
        idx: i + 1,
        length: l.length,
        name: nameCandidate,
        amountCandidate: amount,
        raw: l
      };
    });

    const totalAmount = parsed.reduce((sum, r) => {
      const n = r.amountCandidate ? parseInt(r.amountCandidate.replace(/\D/g, ''), 10) : 0;
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    res.json({
      linesAnalyzed: parsed.length,
      totalAmountCandidate: totalAmount,
      items: parsed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});