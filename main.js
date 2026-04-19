// --------------------------------------------------
// 日本地図（市区町村レベル）色分け PoC
// Data source: smartnews-smri/japan-topography (TopoJSON)
// --------------------------------------------------

// ▼ 地図の各種設定（ここを変更するだけで全体に反映されます）
const MAP_CONFIG = {
    zoomLabelThreshold: 9,                 // 市区町村名を表示し始めるズームレベル
    labelFontSize: 8,                      // 市区町村名の文字サイズ (px)
    labelColor: "#909090ff",                  // 市区町村名の文字色（濃いグレー）
    mapStrokeColor: "#49494938",              // 市区町村の境界線の色
    mapStrokeWidth: 0.05,                   // 市区町村の境界線の太さ（もっと細く）
    prefBorderColor: "#7b7b7bff",             // 都道府県境線の色（濃いグレー）
    prefBorderWidth: 1.0,                   // 都道府県境線の太さ
    colorTarget: "var(--color-dark-orange)",// 指定地域の色
    colorDefault: "var(--color-light-orange)", // その他の地域の色
    hospitalCoreColor: "#f44336",           // 中核病院小児科の色
    hospitalRegionalColor: "#2196f3",       // 地域小児科センターの色
    hospitalMarkerRadius: 3.5               // 病院マーカーの基本半径
};

const width = 800;
const height = 800;

// 地図を配置するSVGを設定
const svg = d3.select("#map")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", "100%");

// 地図を格納するグループ
const g = svg.append("g");

// ズーム機能の追加
const zoom = d3.zoom()
    .scaleExtent([0.5, 40]) // 市区町村単位まで拡大するため上限を40に設定
    .on("zoom", (event) => {
        g.attr("transform", event.transform);

        // 拡大時にラベルを表示するためのロジック
        const k = event.transform.k;
        const showLabels = k >= MAP_CONFIG.zoomLabelThreshold; // 指定レベル以上でラベルを表示

        svg.selectAll(".municipality-label")
            .style("visibility", showLabels ? "visible" : "hidden")
            // 画面上の見た目が指定サイズに保たれるように調整
            .style("font-size", `${MAP_CONFIG.labelFontSize / k}px`);

        // ズーム時にマーカーの見た目の大きさを一定に保つ補正
        svg.selectAll(".marker-layer circle")
            .attr("r", MAP_CONFIG.hospitalMarkerRadius / k)
            .style("stroke-width", 0.8 / k);
    });
svg.call(zoom);

// 投影法の設定
const projection = d3.geoMercator()
    .center([137.0, 38.2])
    .translate([width / 2, height / 2])
    .scale(1600);

const path = d3.geoPath().projection(projection);

const TOPOJSON_URL = "municipality.json";  // ローカルにDL済み（元: smartnews-smri/japan-topography）
const TARGET_CODES_URL = "target_codes.txt";
const HOSPITALS_URL = "hospitals.txt";

// データ読み込みと描画
Promise.all([
    d3.json(TOPOJSON_URL),
    d3.text(TARGET_CODES_URL),
    d3.json(HOSPITALS_URL)
]).then(([topology, targetCodesText, hospitals]) => {
    // 外部のテキストデータから抽出（空行・コメント除外。空白区切りで最初の要素＝コードを抽出）
    const targetMunicipalities = new Set(
        targetCodesText.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith("#"))
            .map(line => line.split(/\s+/)[0])
    );
    // TopoJSONをGeoJSONのFeatureCollectionに変換
    const objectKey = Object.keys(topology.objects)[0];
    const features = topojson.feature(topology, topology.objects[objectKey]).features;

    d3.select("#loading").style("display", "none");

    // レイヤー（グループ）を重ねる順序で作成
    const mapLayer = g.append("g").attr("class", "map-layer");
    const borderLayer = g.append("g").attr("class", "border-layer");
    const labelLayer = g.append("g").attr("class", "label-layer");
    const markerLayer = g.append("g").attr("class", "marker-layer"); // 病院プロット用

    // 1. 市区町村のパス（塗りつぶし）の描画
    mapLayer.selectAll("path")
        .data(features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("class", "municipality")
        .style("stroke", MAP_CONFIG.mapStrokeColor)
        .style("stroke-width", MAP_CONFIG.mapStrokeWidth)
        .attr("fill", d => {
            const code = d.properties.N03_007 || d.properties.code || d.properties.id || "";
            // 指定地域の場合は対象色、そうでない場合はデフォルト色
            if (code && Array.from(targetMunicipalities).some(t => code.startsWith(t))) {
                return MAP_CONFIG.colorTarget;
            }
            return MAP_CONFIG.colorDefault;
        });

    // 2. 都道府県の境界線を黒の太線で描画
    // topojson.meshで、隣り合うポリゴンの都道府県(N03_01)が異なる部分のみを抽出
    borderLayer.append("path")
        .datum(topojson.mesh(topology, topology.objects[objectKey], (a, b) => a.properties.N03_001 !== b.properties.N03_001))
        .attr("d", path)
        .attr("class", "prefecture-border")
        .style("stroke", MAP_CONFIG.prefBorderColor)
        .style("stroke-width", MAP_CONFIG.prefBorderWidth);

    // 3. 市区町村名のラベルを描画
    labelLayer.selectAll("text")
        .data(features)
        .enter()
        .append("text")
        .attr("class", "municipality-label")
        .attr("transform", d => {
            const centroid = path.centroid(d);
            // 正常に重心が計算できるポリゴンのみ配置
            return !isNaN(centroid[0]) ? `translate(${centroid})` : "translate(-9999,-9999)";
        })
        .attr("dy", ".35em") // 垂直方向の中央揃え微調整
        .text(d => d.properties.N03_004 || d.properties.N03_003 || "")
        .style("fill", MAP_CONFIG.labelColor);

    // 4. 病院マーカーを描画
    const tooltip = d3.select("body").append("div")
        .attr("class", "hospital-tooltip")
        .style("opacity", 0);

    markerLayer.selectAll("circle")
        .data(hospitals)
        .enter()
        .append("circle")
        .attr("cx", d => projection([d.lng, d.lat])[0])
        .attr("cy", d => projection([d.lng, d.lat])[1])
        .attr("r", MAP_CONFIG.hospitalMarkerRadius)
        .style("fill", d => d.core ? MAP_CONFIG.hospitalCoreColor : MAP_CONFIG.hospitalRegionalColor)
        .style("stroke", "#ffffff")
        .style("stroke-width", 0.8)
        .on("mouseover", (event, d) => {
            const typeStr = d.core ? "中核病院小児科" : "地域小児科センター";
            const colorStr = d.core ? MAP_CONFIG.hospitalCoreColor : MAP_CONFIG.hospitalRegionalColor;
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <strong>${d.name}</strong>
                <span style="color: #666; font-size: 11px;">${d.address}</span><br>
                <span class="hospital-type" style="color: ${colorStr};">${typeStr}</span>
            `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", (event) => {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => {
            tooltip.transition().duration(200).style("opacity", 0);
        });

}).catch(error => {
    console.error("データの読み込みに失敗しました:", error);
    d3.select("#loading").text("地図データの読み込みに失敗しました。");
});

