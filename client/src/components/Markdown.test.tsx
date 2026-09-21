import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './Markdown';

/** 取出表格里所有单元格的文本 */
function cells(md: string): string[] {
  const html = renderToStaticMarkup(<Markdown source={md} />);
  return (html.match(/<t[dh][^>]*>.*?<\/t[dh]>/g) ?? []).map((c) =>
    c.replace(/<[^>]+>/g, ''),
  );
}

describe('Markdown 表格', () => {
  it('\\| 是转义竖线，不参与分列（art-14 总结表）', () => {
    const out = cells(
      ['| 环节 | 方案 |', '| --- | --- |', '| 分发 | nginx + irm\\|iex 一键安装 |'].join('\n'),
    );
    expect(out).toEqual(['环节', '方案', '分发', 'nginx + irm|iex 一键安装']);
    expect(out.join('')).not.toContain('\\');
  });

  it('表头里的转义竖线同样不分列', () => {
    const out = cells(['| a\\|b | c |', '| --- | --- |', '| 1 | 2 |'].join('\n'));
    expect(out).toEqual(['a|b', 'c', '1', '2']);
  });

  it('转义竖线不破坏其余行的列数', () => {
    const md = [
      '| 环节 | 方案 |',
      '| --- | --- |',
      '| 打包 | Nuitka 单 exe |',
      '| 分发 | nginx + irm\\|iex 一键安装 |',
      '| 质量 | 单测 + CI + pre-commit |',
    ].join('\n');
    const html = renderToStaticMarkup(<Markdown source={md} />);
    const bodyRows = html.match(/<tr[^>]*>.*?<\/tr>/g) ?? [];
    expect(bodyRows).toHaveLength(4); // 1 表头 + 3 数据行
    for (const r of bodyRows) expect(r.match(/<t[dh]/g)).toHaveLength(2);
  });

  it('普通多列表格仍然正确分列', () => {
    const out = cells(['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 | 3 |'].join('\n'));
    expect(out).toEqual(['A', 'B', 'C', '1', '2', '3']);
  });

  it('对齐行照旧生效，不因新切分逻辑退化', () => {
    const html = renderToStaticMarkup(
      <Markdown source={['| 左 | 右 |', '| :--- | ---: |', '| 1 | 2 |'].join('\n')} />,
    );
    expect(html).toContain('text-align:left');
    expect(html).toContain('text-align:right');
  });

  it('反斜杠转义反斜杠（\\\\ → \\）', () => {
    const out = cells(['| p | q |', '| --- | --- |', '| C:\\\\path | 2 |'].join('\n'));
    expect(out).toEqual(['p', 'q', 'C:\\path', '2']);
  });
});
