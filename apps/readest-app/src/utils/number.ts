export const localizeNumber = (num: number, language: string, isIndex = false): string => {
  const lang = language.toLowerCase();
  const isChinese = lang.startsWith('zh');
  if (!isChinese) {
    return num.toString();
  }
  if (!Number.isSafeInteger(num)) return num.toString();
  if (num < 0) return `-${localizeNumber(-num, language, isIndex)}`;

  const isTraditional = lang.includes('tw') || lang.includes('hk');

  const baseDigits = isTraditional ? '零壹貳叁肆伍陸柒捌玖' : '零一二三四五六七八九';
  const zeroChar = isIndex ? '〇' : '零';
  const digits = baseDigits.replace('零', zeroChar);
  const units = isTraditional ? ['', '拾', '佰', '仟'] : ['', '十', '百', '千'];
  const groupUnits = isTraditional ? ['', '萬', '億', '萬億'] : ['', '万', '亿', '万亿'];
  if (num === 0) return zeroChar;

  const str = String(num);
  let result = '';
  const groups = str.match(/\d{1,4}(?=(\d{4})*$)/g)!;
  let skippedGroup = false;
  for (const [index, group] of groups.entries()) {
    const value = Number(group);
    if (value === 0) {
      skippedGroup = true;
      continue;
    }
    if (result && (skippedGroup || value < 1000)) result += zeroChar;
    skippedGroup = false;
    let groupText = '';
    for (let i = 0; i < group.length; i++) {
      const digit = Number(group[i]);
      const position = group.length - i - 1;
      if (digit) groupText += digits[digit]! + units[position]!;
      else if (groupText && !groupText.endsWith(zeroChar)) groupText += zeroChar;
    }
    result +=
      groupText.replace(new RegExp(`${zeroChar}+$`), '') + groupUnits[groups.length - index - 1]!;
  }
  result = result
    .replace(new RegExp(`${zeroChar}+$`), '')
    .replace(`${zeroChar}萬`, '萬')
    .replace(`${zeroChar}万`, '万')
    .replace(new RegExp(`${zeroChar}+`, 'g'), zeroChar);

  if (!isIndex) {
    if (isTraditional) {
      result = result
        .replace(/^貳$/, '兩')
        .replace(/(^|[^壹貳叁肆伍陸柒捌玖])貳([^佰仟萬億壹貳叁肆伍陸柒捌玖]|$)/g, '$1兩$2');
    } else {
      result = result
        .replace(/^二$/, '两')
        .replace(/(^|[^一二三四五六七八九])二([^百千万亿一二三四五六七八九]|$)/g, '$1两$2');
    }
  }

  return result;
};
