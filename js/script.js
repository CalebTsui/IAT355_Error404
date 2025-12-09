console.log("hehe");

async function fetchData() {
    const naMap = await fetch("dataset/usa-map.json").then(r => r.json());
    const raw = await d3.csv("dataset/ufo_sightings.csv");

    const ufoClean = raw.map(d => ({
        city: d["Location.City"],
        state: d["Location.State"],
        country: d["Location.Country"],
        shape: d["Data.Shape"],
        duration: d["Data.Encounter duration"],
        lat: +d["Location.Coordinates.Latitude "],
        lon: +d["Location.Coordinates.Longitude "],
        year: +d["Dates.Sighted.Year"]
    }));

    return { naMap, ufoClean };
}





fetchData().then(async ({ naMap, ufoClean }) => {
    ufoCleanRecent = ufoClean.filter(d => d.year >= 1995)

    const shapeDis = vl
        .markRect({ stroke: "white", strokeWidth: 1 })
        .data(ufoCleanRecent)   
        .encode(
            vl.y().fieldO("shape").title("UFO Shapes"),
            vl.x().bin({step:60}).fieldO("duration").title("Duration (Sec)"),
            vl.color().aggregate("count"),
            vl.tooltip([
                vl.y().fieldO("shape"),
                vl.x().aggregate("count")
            ])
        )
        .width(5000)
        .height(480)
        .toSpec();

    const sightDur = vl
        .markRect()
        .data(ufoCleanRecent)
        .encode(
            vl.y().aggregate("count"),
            vl.x().bin({step:20}).fieldO("duration").title("Duration (Sec)"),
            vl.color().aggregate("count"),
            vl.tooltip([
                vl.x().bin({step:7200}).fieldO("duration").aggregate("count")
            ]),
            vl.text().bin({step:7200}).fieldO("duration").aggregate("count"),
            )
        .width(5000)
        .height(480)
        .toSpec();

    render("#view4", shapeDis);
    render("#view5", sightDur);

    drawTimeline(ufoClean);
});

async function render(viewID, spec) {
  const result = await vegaEmbed(viewID, spec);
  result.view.run();
}

// map visualization

fetchData().then(({ naMap, ufoClean }) => {

    // Limit data from 2005–2014
    const minYear = 2005;
    const maxYear = 2014;

    // Keep only specific yeaer
    const ufoFiltered = ufoClean.filter(d => d.year >= minYear && d.year <= maxYear);

    // Initialize map
    const map = L.map("ufoMap").setView([37.8, -96.0], 4);

    // Add OpenStreetMap tiles
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    // Create a marker cluster group
    let markers = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 60
    });

    map.addLayer(markers);

    function updateMap(selectedYear) {
        markers.clearLayers(); 

        const cumulativeData = ufoFiltered.filter(d => d.year <= selectedYear);

        cumulativeData.forEach(d => {
            if (!isNaN(d.lat) && !isNaN(d.lon)) {
                const marker = L.circleMarker([d.lat, d.lon], {
                    radius: 6,
                    fillColor: "#ff3333",
                    color: "#660000",
                    weight: 1,
                    fillOpacity: 0.9
                });

                marker.bindPopup(`
                    <b>${d.city}, ${d.state}</b><br>
                    <b>Year:</b> ${d.year}<br>
                    <b>Shape:</b> ${d.shape}<br>
                    <b>Duration:</b> ${d.duration} sec
                `);

                markers.addLayer(marker);
            }
        });

        // fit to markers
        if (markers.getLayers().length > 0) {
            map.fitBounds(markers.getBounds(), { padding: [40, 40] });
        }
    }


    // slider
    const slider = document.getElementById("yearSlider");
    const yearLabel = document.getElementById("yearLabel");

    // Initial load
    updateMap(minYear);

    slider.addEventListener("input", () => {
        const selectedYear = parseInt(slider.value);

        yearLabel.innerHTML = `<b>Showing up to year: ${selectedYear}</b>`;

        updateMap(selectedYear);
    });

});

function drawTimeline(ufoData) {

    // user guess

    const guessContainer = document.getElementById("guessContainer");
    const timelineWrapper = document.getElementById("timelineWrapper");
    const guessInput = document.getElementById("guessInput");
    const guessBtn = document.getElementById("guessBtn");
    const guessError = document.getElementById("guessError");

    // Acceptable range (adjust as needed)
    const minYear = 2005;
    const maxYear = 2014;

    guessBtn.onclick = () => {
        const guessedYear = +guessInput.value;

        if (isNaN(guessedYear) || guessedYear < minYear || guessedYear > maxYear) {
            guessError.style.display = "block";
            return;
        }

        guessError.style.display = "none";

        // Hide guess UI and show viz
        guessContainer.style.display = "none";
        timelineWrapper.style.display = "block";

        // Draw chart with highlight
        renderTimeline(guessedYear);
    };

    // line 
    function renderTimeline(guessedYear) {
        const currentYear = new Date().getFullYear();
        const filtered = ufoData.filter(d => d.year >= currentYear - 20);

        // Aggregate by year
        const sightingsByYear = d3.rollups(
            filtered,
            v => v.length,
            d => d.year
        )
        .map(([year, count]) => ({ year: +year, count }))
        .sort((a, b) => d3.ascending(a.year, b.year));

        // Chart Setup
        const margin = { top: 40, right: 40, bottom: 60, left: 70 };
        const width = 900 - margin.left - margin.right;
        const height = 450 - margin.top - margin.bottom;

        d3.select("#timelineChart").selectAll("*").remove();

        const svg = d3.select("#timelineChart")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scale
        const x = d3.scaleLinear()
            .domain(d3.extent(sightingsByYear, d => d.year))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(sightingsByYear, d => d.count)])
            .nice()
            .range([height, 0]);

        // Line
        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d.count))
            .curve(d3.curveMonotoneX);

        // Axes
        svg.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")));

        svg.append("g")
            .call(d3.axisLeft(y));

        // Line animation
        const linePath = svg.append("path")
            .datum(sightingsByYear)
            .attr("fill", "none")
            .attr("stroke", "#4b79ff")
            .attr("stroke-width", 2.5)
            .attr("d", line);

        const totalLength = linePath.node().getTotalLength();

        linePath
            .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
            .attr("stroke-dashoffset", totalLength)
            .transition()
            .duration(2000)
            .ease(d3.easeCubic)
            .attr("stroke-dashoffset", 0);

        // Tooltip
        const tooltip = d3.select("body")
            .append("div")
            .style("position", "absolute")
            .style("background", "white")
            .style("padding", "6px 12px")
            .style("border-radius", "6px")
            .style("font-size", "14px")
            .style("pointer-events", "none")
            .style("box-shadow", "0px 0px 10px rgba(0,0,0,0.2)")
            .style("opacity", 0);

        // Dots
        svg.selectAll("circle.dot")
            .data(sightingsByYear)
            .enter()
            .append("circle")
            .attr("class", "dot")
            .attr("cx", d => x(d.year))
            .attr("cy", d => y(d.count))
            .attr("r", 5)
            .attr("fill", "#ff3b3b")
            .style("opacity", 0)
            .transition()
            .delay(2000)
            .duration(600)
            .style("opacity", 1);

        svg.selectAll("circle.dot")
            .on("mouseover", (event, d) => {
                tooltip.transition().duration(200).style("opacity", 1);
                tooltip.html(`<b>${d.year}</b><br>${d.count} sightings`);
            })
            .on("mousemove", event => {
                tooltip.style("left", event.pageX + 15 + "px")
                       .style("top", event.pageY - 28 + "px");
            })
            .on("mouseout", () => {
                tooltip.transition().duration(200).style("opacity", 0);
            });

        // user guess
        const guessedData = sightingsByYear.find(d => d.year === guessedYear);

        if (guessedData) {

            const guessCircle = svg.append("circle")
                .attr("cx", x(guessedYear))
                .attr("cy", y(guessedData.count))
                .attr("r", 10)
                .attr("fill", "gold")
                .attr("stroke", "white")
                .attr("stroke-width", 2)
                .style("opacity", 0)
                .on("mouseover", (event) => {
                    tooltip.transition().duration(200).style("opacity", 1);
                    tooltip.html(`
                        <b>Your Guess: ${guessedYear}</b><br>
                        ${guessedData.count} sightings
                    `);
                })
                .on("mousemove", (event) => {
                    tooltip.style("left", event.pageX + 15 + "px")
                        .style("top", event.pageY - 28 + "px");
                })
                .on("mouseout", () => {
                    tooltip.transition().duration(200).style("opacity", 0);
                })
                .transition()
                .delay(2600)
                .duration(600)
                .style("opacity", 1);

            // Label
            svg.append("text")
                .attr("x", x(guessedYear))
                .attr("y", y(guessedData.count) - 15)
                .attr("text-anchor", "middle")
                .attr("fill", "gold")
                .style("font-size", "13px")
                .text("Your guess")
                .style("opacity", 0)
                .transition()
                .delay(2600)
                .duration(600)
                .style("opacity", 1);
        }

        // Labels + styling
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height + 45)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("Year");

        svg.append("text")
            .attr("x", -height / 2)
            .attr("y", -50)
            .attr("transform", "rotate(-90)")
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("Number of UFO Sightings");

        svg.selectAll("text").style("fill", "white");
        svg.selectAll(".domain").style("stroke", "white");
        svg.selectAll(".tick line").style("stroke", "white");
    }
}

fetchData().then(({ ufoClean }) => {

    const shapeMap = L.map("shapeMap").setView([37.8, -96.0], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(shapeMap);

    let markers = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60});
    shapeMap.addLayer(markers);

    // Dropdown listener
    const shapeSelect = document.getElementById("shapeSelect");
    shapeSelect.addEventListener("change", () => {
        const selectedShape = shapeSelect.value;
        updateShapeMap(selectedShape);
    });

    // Update function
    function updateShapeMap(shape) {
        markers.clearLayers();
        const filtered = ufoClean.filter(d => d.shape === shape);
        filtered.forEach(d => {
            if (!isNaN(d.lat) && !isNaN(d.lon)) {
                const marker = L.circleMarker([d.lat, d.lon], {
                    radius: 6,
                    fillColor: "#ff3333",
                    color: "#660000",
                    weight: 1,
                    fillOpacity: 0.9
                });
                marker.bindPopup(`<b>${d.city}, ${d.state}</b><br>
                    <b>Year:</b> ${d.year}<br>
                    <b>Duration:</b> ${d.duration} sec`);
                markers.addLayer(marker);
            }
        });
        if (markers.getLayers().length > 0) {
            shapeMap.fitBounds(markers.getBounds(), { padding: [40, 40]});
        }
    }
    updateShapeMap(shapeSelect.value);
})


//neal stuff

// visualization loading data=============================================================

d3.csv("dataset/ufo_sightings.csv").then(data => {

  // Convert numeric fields
  data.forEach(d => {
    d.year = +d["Dates.Documented.Year"];
    d.duration = +d["Data.Encounter duration"];
    d.shape = d["Data.Shape"]?.trim();
  });

  buildScatterplot(data);
  buildBarChart(data);
});

// visualization functions=============================================================

/* =========================
   VISUALIZATION 1 — SCATTER
   ========================= */
function buildScatterplot(data) {
  const container = d3.select("#scatter");
  container.selectAll("*").remove();

  const width = 900, height = 520;
  const margin = { top: 20, right: 20, bottom: 50, left: 70 };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("border", "1px solid #ddd")
    .style("background", "#fff");

  // base scales (untransformed)
  const x0 = d3.scaleLinear()
    .domain(d3.extent(data, d => d.year)).nice()
    .range([margin.left, width - margin.right]);

  const maxDuration = d3.max(data, d => d.duration);
  const y0 = d3.scaleLinear()
    .domain([0, maxDuration]).nice()
    .range([height - margin.bottom, margin.top]);

  // axis groups
  const gx = svg.append("g").attr("class", "x axis")
    .attr("transform", `translate(0, ${height - margin.bottom})`);
  const gy = svg.append("g").attr("class", "y axis")
    .attr("transform", `translate(${margin.left},0)`);

  // plot group
  const dotsG = svg.append("g").attr("class", "dots");

  // initial axis draw
  gx.call(d3.axisBottom(x0).ticks(10, "d"));
  gy.call(d3.axisLeft(y0).ticks(8));

  // create circles bound to data
  dotsG.selectAll("circle")
    .data(data)
    .join("circle")
      .attr("cx", d => x0(d.year))
      .attr("cy", d => y0(d.duration))
      .attr("r", 3)
      .attr("fill", "steelblue")
      .attr("opacity", 0.8);

  // zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([1, 40])
    .translateExtent([[0, 0], [width, height]])
    .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
    .on("zoom", zoomed);

  svg.call(zoom);

  // Slider controls the y-domain multiplier (applied to the max value)
  const slider = document.getElementById("yScale");
  const sliderLabel = document.getElementById("yScaleVal");
  slider.addEventListener("input", () => {
    sliderLabel.textContent = (+slider.value).toFixed(1) + "×";
    applyYScaleAndRedraw();
  });

  // applyYScaleAndRedraw respects the current transform so zoom isn't lost
  function applyYScaleAndRedraw() {
    const factor = +slider.value;

    // new base y scale with scaled domain max
    const yScaled = d3.scaleLinear()
      .domain([0, (maxDuration || 1) * factor]).nice()
      .range([height - margin.bottom, margin.top]);

    // preserve current zoom transform so view doesn't jump when slider changes
    const t = d3.zoomTransform(svg.node());
    const zx = t.rescaleX(x0);
    const zy = t.rescaleY(yScaled);

    // update axes and dots using rescaled axes (so zoom + slider compose)
    gx.call(d3.axisBottom(zx).ticks(10, "d"));
    gy.call(d3.axisLeft(zy).ticks(8));

    dotsG.selectAll("circle")
      .attr("cx", d => zx(d.year))
      .attr("cy", d => zy(d.duration));
  }

  // initial call to set slider label
  sliderLabel.textContent = (+slider.value).toFixed(1) + "×";

  // zoom handler
  function zoomed(event) {
    // When zooming, we must recompute the rescaled axes from the current base scales.
    // The base y scale must incorporate the current slider factor.
    const factor = +slider.value;
    const yScaled = d3.scaleLinear()
      .domain([0, (maxDuration || 1) * factor/10]).nice()
      .range([height - margin.bottom, margin.top]);

    const t = event.transform;
    const zx = t.rescaleX(x0);
    const zy = t.rescaleY(yScaled);

    gx.call(d3.axisBottom(zx).ticks(10, "d"));
    gy.call(d3.axisLeft(zy).ticks(8));

    dotsG.selectAll("circle")
      .attr("cx", d => zx(d.year))
      .attr("cy", d => zy(d.duration));
  }

  // ensure initial layout respects slider value
  applyYScaleAndRedraw();
}

/* ============================
   VISUALIZATION 2 — BAR CHART
   (all shapes; top 5 highlighted)
   ============================ */
function buildBarChart(raw) {
  const container = d3.select("#bars");
  container.selectAll("*").remove();

  const width = 900, height = 480;
  const margin = { top: 20, right: 20, bottom: 120, left: 80 };

  // clean shapes
  const shapes = raw
    .map(d => (d["Data.Shape"] || "").trim())
    .filter(s => s && s.toLowerCase() !== "unknown" && s.toLowerCase() !== "other");

  // counts
  const counts = Array.from(
    d3.rollup(shapes, v => v.length, d => d),
    ([shape, count]) => ({shape, count})
  ).sort((a, b) => d3.descending(a.count, b.count));

  const top5Set = new Set(counts.slice(0, 5).map(d => d.shape));

  // SVG
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "#0c0f14");

  const x = d3.scaleBand()
    .domain(counts.map(d => d.shape))
    .range([margin.left, width - margin.right])
    .padding(0.12);

  const y = d3.scaleLinear()
    .domain([0, d3.max(counts, d => d.count) || 1]).nice()
    .range([height - margin.bottom, margin.top]);

  // SHADOW defs (default)
  const defs = svg.append("defs");
  const filter = defs.append("filter")
    .attr("id", "shadow")
    .attr("height", "150%");
  filter.append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 3)
    .attr("stdDeviation", 4)
    .attr("flood-color", "#000")
    .attr("flood-opacity", 0.35);

  // GLOW (FOR TOP 5)
  const glow = defs.append("filter")
    .attr("id", "glow");
  glow.append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 0)
    .attr("stdDeviation", 8)
    .attr("flood-color", "#a9c7c9")
    .attr("flood-opacity", 0.85);

  // AXES
  const xAxis = svg.append("g")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .style("opacity", 0)             // fade-in start
    .call(d3.axisBottom(x).tickSize(0))
    .call(g => g.select(".domain").remove());

  xAxis.selectAll("text")
    .attr("transform", "rotate(-45)")
    .attr("text-anchor", "end")
    .attr("dy", "0.4em")
    .style("fill", "white")
    .style("font-size", "15px");

  const yAxis = svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .style("opacity", 0)             // fade-in start
    .call(d3.axisLeft(y).ticks(6).tickSize(0))
    .call(g => g.select(".domain").remove());

  yAxis.selectAll("text")
    .style("fill", "white")
    .style("font-size", "14px");

  // === AXIS FADE + SLIDE ANIMATION ===
  xAxis.transition()
    .delay(600)
    .duration(800)
    .style("opacity", 1)
    .attr("transform", `translate(0, ${height - margin.bottom})`);

  yAxis.transition()
    .delay(600)
    .duration(800)
    .style("opacity", 1);

  // === BARS (with animation start states) ===
  const bars = svg.append("g")
    .selectAll("rect")
    .data(counts)
    .join("rect")
      .attr("x", d => x(d.shape))
      .attr("width", x.bandwidth())
      .attr("y", y(0))
      .attr("height", 0)
      .attr("fill", "#a9c7c9")
      .attr("opacity", d => top5Set.has(d.shape) ? 1 : 0.45)
      .style("rx", 6)
      .style("ry", 6)
      .attr("filter", "url(#shadow)")
      .style("transition", "all 0.25s ease-out");   // smooth color + transform transitions

  // === BAR INTRO ANIMATION ===
  bars.transition()
    .delay((d,i)=> i*60)
    .duration(900)
    .ease(d3.easeCubicOut)
    .attr("y", d => y(d.count))
    .attr("height", d => y(0) - y(d.count));


  // LABEL “Reports”
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 35)
    .attr("text-anchor", "middle")
    .style("fill", "white")
    .style("font-size", "18px")
    .text("Shapes")
    .style("opacity", 0)
    .transition()
      .delay(500)
      .duration(700)
      .style("opacity", 1);
}
