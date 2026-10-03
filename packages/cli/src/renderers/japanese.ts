import type { FindingV1 } from "@payoutjp/core";

const messages: Readonly<Record<string, string>> = {
  "BANK-CODE-001": "銀行コードは指定された桁数の半角数字で入力してください。",
  "BANK-CODE-002": "銀行コードが選択したRegistryにありません。",
  "BANK-BRANCH-001": "支店コードは指定された桁数の半角数字で入力してください。",
  "BANK-BRANCH-002": "支店コードが選択したRegistryにありません。",
  "BANK-BRANCH-003": "支店コードと銀行の組合せがRegistryに一致しません。",
  "BANK-NUMBER-001": "口座番号に半角数字以外が含まれています。",
  "BANK-NUMBER-002": "口座番号の桁数が選択したProfileの条件に合いません。",
  "BANK-TYPE-001": "口座種別が選択したProfileの許可値に合いません。",
  "BANK-HOLDER-001": "口座名義を入力してください。",
  "BANK-HOLDER-002": "口座名義の前後に空白が含まれています。",
  "BANK-HOLDER-003": "口座名義に制御文字が含まれています。",
  "BANK-HOLDER-004": "口座名義が指定されたUnicode正規化で変化します。",
  "BANK-HOLDER-005": "口座名義にProfileで許可されていない文字があります。",
  "BANK-HOLDER-006": "口座名義がProfileのバイト長上限を超えています。",
  "INPUT-SCHEMA-001": "入力項目の型・必須値・列の対応を確認してください。",
};

/** Localizes human guidance only; canonical JSON and message keys remain unchanged. */
export function japaneseGuidance(finding: FindingV1): readonly string[] {
  return [
    messages[finding.ruleId] ?? "選択したProfileの条件に合いません。",
    "対応: 元データの該当項目と列マッピングを確認し、登録情報に基づいて修正して再実行してください。",
  ];
}
