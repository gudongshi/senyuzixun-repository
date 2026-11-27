import UniversalOcr from '../components/ocr/UniversalOcr';

// ============================================================
// v16.12: 合同关键信息提取 — 智能自由提取
// ============================================================

const CONTRACT_PROMPT = `你是一个专业的法务合同审查助手。请提取该合同中的以下信息，以 Markdown 列表输出：

1. 甲乙双方名称
2. 合同金额
3. 日期
4. 其他你认为重要的核心条款（如：保密义务、违约责任、争议解决方式、质保期等）

只输出能识别到的字段，不要输出任何多余的解释。`;

export default function ContractExtractor() {
  return <UniversalOcr title="📄 合同关键信息提取" prompt={CONTRACT_PROMPT} />;
}