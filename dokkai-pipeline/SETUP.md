# 多読パイプライン — セットアップ手順（ニコ向け・初心者OK）

このフォルダの中身が「多読講座 セールスパイプライン」の本体です。
Google スプレッドシート＋GAS（Google Apps Script）で動きます。
**プログラミングの知識がなくても、この順番どおりに進めれば動きます。**

## このフォルダに入っているファイル

| ファイル | 役割 |
|---|---|
| `Code.gs` | サーバー側の全処理（DB読み書き・自動遷移・通知・フォーム受信） |
| `Index.html` | カンバン画面の骨組み |
| `Styles.html` | 画面の見た目（CSS） |
| `JavaScript.html` | 画面の動き（ドラッグ＆ドロップ・モーダル等） |
| `appsscript.json` | プロジェクト設定（タイムゾーン・権限） |
| `SETUP.md` | このファイル |

> 💡 GAS には HTML 用の専用ファイル形式がないため、CSS と JavaScript も
> **拡張子 `.html` のまま** で持っています。これで正常です。

---

## A. いちばんカンタンな導入（コピペ方式）

clasp（開発ツール）を使わず、Apps Script エディタに貼り付けるだけの方法です。
**まずはこれで動かすのがおすすめです。**

### ステップ1：スプレッドシートを作る
1. Google ドライブで新しいスプレッドシートを作成。
2. 名前を `多読パイプラインDB` などに変更。
   （シートの中身は空でOK。ツールが自動で `customers` / `archive` / `config` を作ります）

### ステップ2：Apps Script を開く
1. スプレッドシート上部メニュー → **拡張機能 → Apps Script**。
2. 新しいプロジェクトが開きます。

### ステップ3：ファイルを貼り付ける
Apps Script エディタの左側「ファイル」で次を作ります。

1. **`Code.gs`**：最初からある `コード.gs`（または `Code.gs`）を開き、
   中身を全部消して、このフォルダの `Code.gs` の内容を丸ごと貼り付け。
2. 「＋」→ **HTML** で `Index` を作成 → `Index.html` の中身を貼り付け。
3. 同様に **HTML** で `Styles` を作成 → `Styles.html` の中身を貼り付け。
4. 同様に **HTML** で `JavaScript` を作成 → `JavaScript.html` の中身を貼り付け。

> ⚠️ HTML ファイルを作るとき、名前は **`Index` / `Styles` / `JavaScript`**
> （拡張子 `.html` はエディタが自動で付けます）。大文字・小文字までこのとおりに。

5. `appsscript.json` を反映するには：左上の歯車 **⚙ プロジェクトの設定** →
   「**「appsscript.json」マニフェスト ファイルをエディタで表示する**」にチェック。
   左側に出てくる `appsscript.json` を、このフォルダの内容で置き換え。

### ステップ4：スクリプト プロパティを登録（通知・フォーム設定）
⚙ **プロジェクトの設定 → スクリプト プロパティ → プロパティを追加** で
次の4つを登録します。

| プロパティ名 | 値の例 | 説明 |
|---|---|---|
| `NOTIFY_CHANNEL` | `chat` | `chat`（既定）/ `gmail` / `both` |
| `CHAT_WEBHOOK_URL` | （後述で取得するURL） | Google Chat の通知先（メイン） |
| `NOTIFY_EMAILS` | `nico@example.com,staff@example.com` | Gmail宛先（予備・カンマ区切り） |
| `FORM_SECRET` | `好きな長い文字列` | フォーム受信の合言葉（推測されにくい値に） |

> `CHAT_WEBHOOK_URL` の取り方は **末尾の「C. Google Chat の通知先を作る」** を参照。
> まだ無くても先に進めます（その場合は通知だけ飛びません）。

### ステップ5：Webアプリとして公開（デプロイ）
1. 右上 **デプロイ → 新しいデプロイ**。
2. 種類の選択（歯車）→ **ウェブアプリ**。
3. 設定：
   - 説明：`多読パイプライン`
   - 次のユーザーとして実行：**自分**
   - アクセスできるユーザー：**自分のみ**（社内共有なら「組織内のユーザー」）
4. **デプロイ** → 初回は Google の権限承認画面が出ます。
   「詳細」→「(安全でないページ)に移動」→「許可」で進めてください
   （自分が作ったアプリなので問題ありません）。
5. 表示された **ウェブアプリ URL** がツール本体です。ブックマーク推奨。

### ステップ6：毎朝の自動処理をONにする
1. エディタ上部の関数選択で **`setupDailyTrigger`** を選び、**▶ 実行**。
   → 毎朝9時（日本時間）に自動遷移・リマインドが動くようになります。
2. （任意）通知のテスト：関数 **`testNotification`** を実行 →
   Chat / Gmail にテストメッセージが届けば成功。

これで完成です！🎉

---

## B. clasp で管理する場合（開発者向け・任意）

ローカルでコード管理したい場合は clasp が使えます。

```bash
npm install -g @google/clasp
clasp login

# 既存スプレッドシートに紐づける場合（推奨）：
# 1) スプレッドシートのApps Scriptを一度開き、URLの .../d/<SCRIPT_ID>/edit から
#    SCRIPT_ID を控える
# 2) このフォルダに .clasp.json を作成：
#    { "scriptId": "<SCRIPT_ID>", "rootDir": "." }
clasp push   # ローカルの .gs / .html / appsscript.json をアップロード
```

> 新規に作る場合は `clasp create --type sheets --title "多読パイプライン"` でも可。
> その後の「スクリプト プロパティ／デプロイ／トリガー」は A と同じ手順です。

---

## C. Google Chat の通知先（Webhook URL）を作る

リマインドのメイン通知先は **Google Chat スペースの Incoming Webhook** です。

1. Google Chat で通知を受け取りたい **スペース** を開く（無ければ作成）。
2. スペース名をクリック → **アプリと連携**（または **Webhook / Webhook を管理**）。
3. **Webhook を追加** → 名前（例：`多読リマインド`）を入力 → 保存。
4. 発行された **URL をコピー**。
5. その URL を、Apps Script の **スクリプト プロパティ `CHAT_WEBHOOK_URL`** に貼り付け。

> 組織の設定で Webhook が無効な場合は、管理者に有効化を依頼してください。
> Chat が使えない間は `NOTIFY_CHANNEL` を `gmail` にして Gmail で受け取れます。

---

## D. フォーム自動流入（HubSpot 連携）

### D-0. 対象フォーム（ニコ共有・3種）

| フォーム | 用途 | 送る `type` | 反映先 |
|---|---|---|---|
| 体験申し込みフォーム<br>`https://40iizu.share-na2.hsforms.com/2Agxzyh3YQXyiMgT9PjK6SQ` | お問い合わせ | `inquiry` | ①面談未実施 に新規カード |
| ※夏休み限定 成約フォーム<br>`https://40iizu.share-na2.hsforms.com/2N_eoPnYsSRO45uTDArWgNw` | 成約 | `contract` | ⑦成約（保護者Emailで突合） |
| ※通常プラン 成約フォーム<br>`https://40iizu.share-na2.hsforms.com/2PcY7cwLmS-aTA34LEsKWmw` | 成約 | `contract` | ⑦成約（保護者Emailで突合） |

> 上の URL は **HubSpot のフォーム公開ページ**（回答者が入力する画面）です。
> パイプラインへ自動反映するには、HubSpot 側で「フォーム送信時に、本ツールの
> Webアプリ URL（`/exec`）へ Webhook を飛ばす」設定を **1フォームにつき1つ** 作ります（下記 D-1）。

### D-1. HubSpot 側の設定（フォーム → 本ツールへ Webhook）

各フォームについて、HubSpot の **ワークフロー（Workflow）** を作成します。

1. HubSpot → **自動化 → ワークフロー → 作成 →「フォーム送信を基準にする」**。
2. 登録トリガー：対象フォーム（例：体験申し込みフォーム）の送信。
3. アクション追加 → **「Webhook」**（Operations Hub が必要。無い場合は末尾の代替案へ）。
   - メソッド：**POST**
   - Webhook URL：本ツールの Webアプリ URL に `?secret=（FORM_SECRETの値）` を付けたもの
     例：`https://script.google.com/macros/s/XXXX/exec?secret=あなたの合言葉`
   - 送信プロパティ：下表のキー名で、フォーム項目をマッピング。
4. 体験申し込みフォームのワークフローには、本文（プロパティ）に **`type` = `inquiry`** を、
   成約フォーム2種には **`type` = `contract`** を必ず含めます
   （`?secret=` を使う場合でも `type` は本文に必要です）。
5. 公開（オン）にする。

> 💡 `?secret=` を使わず、本文（body）に `secret` を入れてもOKです。どちらでも認証できます。

### D-2. 本ツールが受け取る JSON の形

- お問い合わせ → ①面談未実施 に自動追加：
  ```json
  { "secret": "FORM_SECRETの値", "type": "inquiry",
    "name": "山田花子", "parentEmail": "oya@example.com", "country": "日本" }
  ```
- 成約 → ⑦成約 に自動移動（`parentEmail` で既存カードと突合。無ければ新規作成して⑦へ）：
  ```json
  { "secret": "FORM_SECRETの値", "type": "contract",
    "parentEmail": "oya@example.com" }
  ```

送れるキー（任意・あるものだけでOK）：
`name` `intakeName` `grade` `country` `parentEmail` `otherEmail` `staff`
`meetingDate` `reason` `level` `notes` `trialDate` `trialTime`

> `secret` は URL の `?secret=...` でも本文内でもOK。**合言葉が一致しないリクエストは拒否**されます。
> 成約フォームは「夏休み限定／通常プラン」のどちらも `type:"contract"` で同じ⑦へ入ります。
> プラン名を残したい場合は `notes` に入れて送ってください。

### D-3. Operations Hub が無い場合（代替）

HubSpot の Webhook アクションは Operations Hub が必要です。無い場合は、
**Zapier / Make** の「HubSpot: New Form Submission」→「Webhooks: POST」で、
上記と同じ URL・JSON を送れば同じように連携できます。

### D-4. 連携テスト

設定前でも、ターミナルから疎通確認できます（`FORM_SECRET` と URL は自分のものに置換）：

```bash
curl -L -X POST "https://script.google.com/macros/s/XXXX/exec" \
  -H "Content-Type: application/json" \
  -d '{"secret":"あなたの合言葉","type":"inquiry","name":"テスト 花子","parentEmail":"test@example.com"}'
```

`{"ok":true,...}` が返り、①列にカードが増えれば成功です。

---

## E. 動作テスト（チェックリスト）

公開後、次を確認してください（仕様書の §10 に対応）。

- [ ] ①→②：必須8項目が未入力だと「移動できません」と出てブロックされる
- [ ] ②→③：体験授業日程が無いとブロック
- [ ] 体験日を過去日にして `dailyJob` を手動実行 → ③が④へ自動移動
- [ ] ④/⑥にカードがある状態で `dailyJob` → Chat/Gmail に通知が届く
- [ ] ⑤でリマインド送信日を3日前に → 通知。7日前＆理由なし → ⑧へ自動
- [ ] ⑤で「停滞の理由」を選ぶ → 移動先が自動で⑥になる
- [ ] ⑧でロスト日(`lostAt`)を30日前に → アーカイブへ移動し盤面から消える
- [ ] アーカイブ検索 → 「パイプラインに戻す」で復帰できる
- [ ] ①→⑧へ一気に移動：全必須が揃えば成功 / 1つでも欠ければ失敗
      （「面談前ロスト」にチェックすると必須なしで⑧へ移動可）
- [ ] `doPost` に inquiry / contract を送って ① / ⑦ に反映される

> 日付を「○日前」にするテストは、スプレッドシートの該当セルを直接書き換えると簡単です
> （`trialDate` / `reminderSentDate` / `lostAt` の列）。書き換え後に
> エディタから `dailyJob` を実行して結果を確認します。

---

## よくある質問

**Q. コードを更新したら、また何かする必要は？**
A. Apps Script で変更後、**デプロイ → デプロイを管理 → 鉛筆✏ → バージョン「新バージョン」→ デプロイ**
   をすると、同じ URL のまま最新版に更新されます。

**Q. 通知が来ない**
A. `NOTIFY_CHANNEL` の値、`CHAT_WEBHOOK_URL` / `NOTIFY_EMAILS` の設定を確認。
   `testNotification` を実行して切り分けてください。

**Q. 画面が真っ白／エラー**
A. HTML ファイル名が `Index` / `Styles` / `JavaScript` になっているか確認。
   大文字小文字も一致している必要があります。
