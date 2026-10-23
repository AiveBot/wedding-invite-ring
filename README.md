# 圆环 · 婚礼邀请函 MVP（Dev）

只在本机运行：`PORT=8799 ./serve.sh`，打开 http://127.0.0.1:8799/index.html 。加 `?auto=1` 会自动演示旋转 → 展开 → 浏览 → 关闭。没有部署到任何服务器。

交互对齐 Cuvii CreativeSpace 作品页的公开表现（圆环拖拽惯性旋转、方向键、点按/回车展开为底栏浏览流、Esc/点空白关闭、高速拖影），用自写代码重写，没有拷贝对方源码或图片/视频素材。

中间居中文字是婚礼信息占位：新郎 & 新娘、2027.05.20、示例花园。

## 素材来源
照片（样例，正式版会换成新人自己的）：
- `img/card01.jpg`：Pexels #265722
- `img/card02.jpg`：Pexels #1589216
- `img/card03.jpg`：Pexels #3014856
- `img/card04.jpg`：Pexels #27269407（Anastasia Nagibina，作者名来自此前检索摘要）
- `img/card05.jpg`：Pexels #33325194（Alexander Mass，摘要）
- `img/card06.jpg`：Pexels #36154466（Kadir Altıntaş，曾用页面核实）
- `img/card07.jpg`：Pexels #37486433（Jeff Dobson，摘要）
- `img/card08.jpg`：Pexels #1024993（中心裁成竖图）
- `img/card09.jpg`：Pexels #2253870（中心裁成竖图）
- `img/card10.jpg`：Pexels #948185

作者名没有在本轮逐张打开 Pexels 页面复核（除 36154466 此前核实过）。Pexels 均为可免费使用的图库许可。

字体（SIL OFL）：
- Cormorant Garamond（正体、斜体）
- Noto Serif CJK SC：用 `_tools/subset_font.sh` 按页面用字切出 `fonts/NotoSerifSC-subset.woff`

Three.js r169（MIT），见 `lib/three-LICENSE.txt`。

页面上的姓名、日期、地点和照片说明都是示例占位文字。


## 自测备注
- 录屏：Playwright Chromium 390×844（isMobile + DPR2）+ CDP `Page.startScreencast`，再 ffmpeg 合成 780×1688 / 60fps / h264 yuv420p。文件：`录屏/圆环MVP_780x1688.mp4`（约 36s）。
- 逐秒截图：`截图/逐秒/001.png`… 与 `截图/逐秒_总览.png`。四象限灰边检查：0；有一次亮度跳变在关闭回圆环附近（展开/收起过渡）。
- 帧耗时（headless Chromium，非真机）：rAF 单帧工作时间 mean ≈ 0.27ms，p95 ≈ 0.4ms，max ≈ 16.7ms；screencast 墙钟约 55.8 fps。机器空闲时的数字，不代表手机/微信里的流畅度。
- 交互已手测：拖拽旋转 + 惯性、方向键给角速度、Enter 打开当前最上卡片、展开后左右键浏览、Esc / 点空白关闭。
- 已知局限：中间详情区到照片带之间留白较大（对齐参考站「顶栏文案 + 底栏作品流」）；拖影在慢速旋转时不明显；样例图部分为横向原图中心裁成竖图；未上真机、未接微信。
