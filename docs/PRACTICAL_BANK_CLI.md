# Bank CSVの一括検査

`0.1.0-alpha.2`ソース候補の機能です。公開済み`0.1.0-alpha.1`には含まれません。
Node.js 24 / pnpm 11.25.0を使い、リポジトリ直下から次を実行します。
CLIの絶対パスを保持する関数により、サンプルディレクトリへ移動しても実行できます。

## 初めて試す

```sh
pnpm install --frozen-lockfile
pnpm build
PAYOUTJP_CLI="$PWD/packages/cli/dist/main.js"
payoutjp() { node "$PAYOUTJP_CLI" "$@"; }
payoutjp init --template bank-csv --directory ./payoutjp-demo
cd payoutjp-demo
payoutjp doctor
payoutjp audit recipients.csv --profile bank-generic-jp@0.1.0 --mapping columns.json --locale ja
```

2件の架空データを検査します。3行目の口座番号は意図的な異常値です。元CSVで`12X4567`を
架空の正常値`0123456`に直して再実行するとPASSになります。実際の口座番号を自動変換しません。

## 手持ちのCSV

UTF-8、ヘッダーあり、カンマ区切りを受け付けます。BOM、CRLF/LF、引用符内の改行を扱います。
標準の列は`bankCode,branchCode,accountType,accountNumber,accountHolder`で、`id`は任意です。
番号は文字列のまま保持します。表計算ソフト等で消えた先頭ゼロは復元できません。
元システムから番号を文字列として出力し直してください。

日本語列名等は、次のように`columns.json`で明示的に対応付けます。

```json
{
  "schemaVersion": "1",
  "columns": {
    "bankCode": "銀行コード",
    "branchCode": "支店コード",
    "accountType": "預金種目",
    "accountNumber": "口座番号",
    "accountHolder": "口座名義"
  },
  "values": { "accountType": { "普通": "ordinary", "当座": "checking" } },
  "ignoreColumns": ["備考"]
}
```

列名の推測や名義の修正は行いません。未指定の余剰列と重複ヘッダーはエラーです。
`ignoreColumns`は指定列を検査入力とreportから捨てます。未定義の口座種別はその行のFAILになります。

```sh
payoutjp audit recipients.csv --profile bank-generic-jp@0.1.0 --mapping columns.json --format json --output report.json
payoutjp audit recipients.csv --profile bank-generic-jp@0.1.0 --mapping columns.json --format json --output report.json --overwrite-report
cat recipients.csv | payoutjp audit - --input-format csv --profile bank-generic-jp@0.1.0 --mapping columns.json
```

既存audit reportの置換には`--overwrite-report`が必要です。入力・設定・対応表・Profile・Registryは
出力先に指定できません。書込失敗時に以前のreportが残ることがあるため、終了コードを確認します。
従来`validate`でのreport置換は維持しています。

## JSONバッチとID

```json
{
  "schemaVersion": "1",
  "items": [
    {
      "destination": {
        "schemaVersion": "1",
        "rail": "bank_transfer",
        "bankCode": "1234",
        "branchCode": "001",
        "accountType": "ordinary",
        "accountNumber": "0123456",
        "accountHolder": "SYNTHETIC"
      }
    }
  ]
}
```

`payoutjp audit batch.json --profile bank-generic-jp@0.1.0 --format json`で検査します。
1つのBank Profileに限定します。CLIでProfileを指定しない場合、各itemに同一の`profileId`が必要です。
型不正等の行は`INPUT-SCHEMA-001`でFAILとし、残りの行も検査します。構文破損は全体エラーです。

IDは既定で行順の`item-000001`です。行を並べ替えたときの同一人物の追跡には使えません。
`--id-policy input`を使う場合は全件に非機密・一意・128文字以内のIDが必要です。
名義・口座番号・メール等をIDとして割り当てないでください。itemとdestinationの両方にIDを置く場合は一致が必要です。

textは100 findingまで表示し、省略件数を示します。全結果には`--format json`を使います。
CSVは物理開始行、JSONはJSON Pointerから修正箇所を確認できます。日本語表示は`--locale ja`を指定します。

## 自分のRegistryを接続する

`bank-generic-jp`は構造検査です。実在する銀行や支店の照合には、適切な権利で保有するローカルRegistryと
その版を参照するProfileを用意します。本番銀行データは同梱していません。

1. [canonical Bank Registry形式](./05_DATA_CONTRACTS.md)でローカルJSONを用意します。
2. Coreの`calculateRegistryEnvelopeSha256`で、sha256自身を除いたcanonical envelopeのdigestを計算します。
3. Profileの`registries`に`id`・`version`・`sha256`を固定し、`BANK-CODE-002`、`BANK-BRANCH-002`、`BANK-BRANCH-003`を有効にします。
4. `payoutjp.config.yml`にProfile/Registryパスを登録し、`doctor`と`registry status`で整合性を検査します。

```yaml
version: 1
failOn: error
paths:
  profiles: [./profiles]
  registries: [./registries]
```

合成データの例は`fixtures/bank/registry`と`fixtures/bank/profiles`にあります。
`payoutjp profiles list`と`payoutjp profiles show <id@version>`でルールと参照を確認できます。
digest一致はRegistryの内容の整合性であり、最新性・網羅性・口座実在性の確認ではありません。
日付や出所、使用権限をデータの提供元と確認してください。

| 診断 | 確認すること |
|---|---|
| Registry未設定・見つからない | configの`paths.registries`と、Profileが参照するID/版のファイルを確認する。相対パスはconfig基準。 |
| ID/版不一致 | Profileが固定する版を用意する。新しい版を使う場合は新しいProfileとして参照を変更し、既存版を上書きしない。 |
| digest不一致 | 信頼できる元のスナップショットへ戻す。検査を通すためだけにdigestを書き換えず、変更内容・出所・版を確認する。 |
| Registry照合ルールが無効 | `doctor`の`registryLookupEnabled`と`profiles show`を確認する。構造検査のPASSは銀行・支店の照合済みを意味しない。 |

## CIと終了コード

CIでは公開済み版と追加機能の範囲を確認し、使用するpackage版を固定します。
次期版の公開前はソースからビルドして通常のcommand stepで使えます。

```yaml
- name: Build
  run: pnpm build
- name: Audit Bank sample
  run: node packages/cli/dist/main.js audit fixtures/cli/batches/valid.csv --profile bank-generic-jp@0.1.0 --format json --output payoutjp-report.json
```

実データをCIで扱う場合は自社の取扱い規則に従い、入力CSVをartifactへ入れません。
reportも意図した権限・保存期間で扱い、入力IDを出す場合はそのmetadataを含むことを考慮します。
終了コード0は`--fail-on`を満たす結果、1は検査不備、2は入力/設定/上限、3は内部エラー、4はRegistry整合性です。
`--fail-on never`でも2〜4は無視しません。エラー終了時に古いreportを新結果として保存しないでください。

上限は入力50 MiB、10万件、CSV record 64 KiB、field 8 KiB、finding 10万件です。
大きすぎる入力は明示エラーとなり、成功reportとして切り捨てません。
