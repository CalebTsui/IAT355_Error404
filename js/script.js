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

    drawTimeline(ufoClean);
});

async function render(viewID, spec) {
  const result = await vegaEmbed(viewID, spec);
  result.view.run();
}

// MAP GRAPH

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

// LINE GRAPH

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

        // annotation
        const annotationYear = 2012;
        const annotationX = x(annotationYear);

        // Vertical dashed line at 2012
        const annoLine = svg.append("line")
            .attr("x1", annotationX)
            .attr("y1", height)
            .attr("x2", annotationX)
            .attr("y2", 0)
            .attr("stroke", "#ffcc66")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "6 4")
            .style("opacity", 0)
            .transition()
            .delay(2000) // same time dots appear
            .duration(600)
            .style("opacity", 1);

        // Annotation box group
        const annoGroup = svg.append("g")
            .attr("transform", `translate(${annotationX - 345}, ${y(6000) -50})`)
            .style("opacity", 0);

        // Background rounded rectangle
        annoGroup.append("rect")
            .attr("width", 325)
            .attr("height", 105)
            .attr("rx", 12)
            .attr("fill", "#101520")
            .attr("stroke", "#233044")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.92);

        // Text content
        annoGroup.append("text")
            .attr("x", 15)
            .attr("y", 25)
            .attr("fill", "white")
            .style("font-size", "14px")
            .style("font-weight", "400")
            .text("The U.S. government's secretive UFO program,");

        annoGroup.append("text")
            .attr("x", 15)
            .attr("y", 45)
            .attr("fill", "white")
            .style("font-size", "14px")
            .text("Advanced Aerospace Threat Identification Program");

        annoGroup.append("text")
            .attr("x", 15)
            .attr("y", 65)
            .attr("fill", "white")
            .style("font-size", "14px")
            .text("(AATIP), officially ended in 2012, which may be");

        annoGroup.append("text")
            .attr("x", 15)
            .attr("y", 85)
            .attr("fill", "white")
            .style("font-size", "14px")
            .text("linked to the potential increase in sightings.");

        // Fade in box with dots
        annoGroup.transition()
            .delay(2000)
            .duration(600)
            .style("opacity", 1);


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

  // buildScatterplot(data);
  buildBarChart(data);
});

// // visualization functions=============================================================

// /* =========================
//    VISUALIZATION 1 — SCATTER
//    ========================= */
// function buildScatterplot(data) {
//   const container = d3.select("#scatter");
//   container.selectAll("*").remove();

//   const width = 900, height = 520;
//   const margin = { top: 20, right: 20, bottom: 50, left: 70 };

//   const svg = container.append("svg")
//     .attr("width", width)
//     .attr("height", height)
//     .style("border", "1px solid #ddd")
//     .style("background", "#fff");

//   // base scales (untransformed)
//   const x0 = d3.scaleLinear()
//     .domain(d3.extent(data, d => d.year)).nice()
//     .range([margin.left, width - margin.right]);

//   const maxDuration = d3.max(data, d => d.duration);
//   const y0 = d3.scaleLinear()
//     .domain([0, maxDuration]).nice()
//     .range([height - margin.bottom, margin.top]);

//   // axis groups
//   const gx = svg.append("g").attr("class", "x axis")
//     .attr("transform", `translate(0, ${height - margin.bottom})`);
//   const gy = svg.append("g").attr("class", "y axis")
//     .attr("transform", `translate(${margin.left},0)`);

//   // plot group
//   const dotsG = svg.append("g").attr("class", "dots");

//   // initial axis draw
//   gx.call(d3.axisBottom(x0).ticks(10, "d"));
//   gy.call(d3.axisLeft(y0).ticks(8));

//   // create circles bound to data
//   dotsG.selectAll("circle")
//     .data(data)
//     .join("circle")
//       .attr("cx", d => x0(d.year))
//       .attr("cy", d => y0(d.duration))
//       .attr("r", 3)
//       .attr("fill", "steelblue")
//       .attr("opacity", 0.8);

//   // zoom behavior
//   const zoom = d3.zoom()
//     .scaleExtent([1, 40])
//     .translateExtent([[0, 0], [width, height]])
//     .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
//     .on("zoom", zoomed);

//   svg.call(zoom);

//   // Slider controls the y-domain multiplier (applied to the max value)
//   const slider = document.getElementById("yScale");
//   const sliderLabel = document.getElementById("yScaleVal");
//   slider.addEventListener("input", () => {
//     sliderLabel.textContent = (+slider.value).toFixed(1) + "×";
//     applyYScaleAndRedraw();
//   });

//   // applyYScaleAndRedraw respects the current transform so zoom isn't lost
//   function applyYScaleAndRedraw() {
//     const factor = +slider.value;

//     // new base y scale with scaled domain max
//     const yScaled = d3.scaleLinear()
//       .domain([0, (maxDuration || 1) * factor]).nice()
//       .range([height - margin.bottom, margin.top]);

//     // preserve current zoom transform so view doesn't jump when slider changes
//     const t = d3.zoomTransform(svg.node());
//     const zx = t.rescaleX(x0);
//     const zy = t.rescaleY(yScaled);

//     // update axes and dots using rescaled axes (so zoom + slider compose)
//     gx.call(d3.axisBottom(zx).ticks(10, "d"));
//     gy.call(d3.axisLeft(zy).ticks(8));

//     dotsG.selectAll("circle")
//       .attr("cx", d => zx(d.year))
//       .attr("cy", d => zy(d.duration));
//   }

//   // initial call to set slider label
//   sliderLabel.textContent = (+slider.value).toFixed(1) + "×";

//   // zoom handler
//   function zoomed(event) {
//     // When zooming, we must recompute the rescaled axes from the current base scales.
//     // The base y scale must incorporate the current slider factor.
//     const factor = +slider.value;
//     const yScaled = d3.scaleLinear()
//       .domain([0, (maxDuration || 1) * factor/10]).nice()
//       .range([height - margin.bottom, margin.top]);

//     const t = event.transform;
//     const zx = t.rescaleX(x0);
//     const zy = t.rescaleY(yScaled);

//     gx.call(d3.axisBottom(zx).ticks(10, "d"));
//     gy.call(d3.axisLeft(zy).ticks(8));

//     dotsG.selectAll("circle")
//       .attr("cx", d => zx(d.year))
//       .attr("cy", d => zy(d.duration));
//   }

//   applyYScaleAndRedraw();
// }

// BAR CHART

function buildBarChart(raw) {
  const container = d3.select("#bars");
  container.selectAll("*").remove();

  const width = 900, height = 480;
  const margin = { top: 20, right: 20, bottom: 120, left: 80 };

  // Clean shapes
  const shapes = raw
    .map(d => (d["Data.Shape"] || "").trim())
    .filter(s => s && s.toLowerCase() !== "unknown" && s.toLowerCase() !== "other");

  // Count occurrences
  const counts = Array.from(
    d3.rollup(shapes, v => v.length, d => d),
    ([shape, count]) => ({ shape, count })
  ).sort((a, b) => d3.descending(a.count, b.count));

  const top5 = counts.slice(0, 5).map(d => d.shape);
  const top5Set = new Set(top5);

  // Annotation content (customize as needed)
  const descriptions = {
    light: "The light shape is like a burst of light that just flashes through really quick.",
    triangle: "Triangular sightings are often described as silent, large, and slow-moving.",
    circle: "Circular sightings are one of the classic UFO shapes, often bright and hovering.",
    fireball: "Fireball sightings appear as blazing balls of light moving rapidly.",
    sphere: "Spherical craft are often described as smooth, bright, and floating silently."
  };

  // SVG
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleBand()
    .domain(counts.map(d => d.shape))
    .range([margin.left, width - margin.right])
    .padding(0.12);

  const y = d3.scaleLinear()
    .domain([0, d3.max(counts, d => d.count) || 1]).nice()
    .range([height - margin.bottom, margin.top]);

  // glow
  const defs = svg.append("defs");
  const glow = defs.append("filter")
    .attr("id", "glow");
  glow.append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 0)
    .attr("stdDeviation", 8)
    .attr("flood-color", "#a9c7c9")
    .attr("flood-opacity", 0.85);

  // Axes
  const xAxis = svg.append("g")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .style("opacity", 0)
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
    .style("opacity", 0)
    .call(d3.axisLeft(y).ticks(6).tickSize(0))
    .call(g => g.select(".domain").remove());

  yAxis.selectAll("text")
    .style("fill", "white")
    .style("font-size", "14px");

  // Fade in
  xAxis.transition().delay(600).duration(800).style("opacity", 1);
  yAxis.transition().delay(600).duration(800).style("opacity", 1);

  // Bars
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
      .style("cursor", d => top5Set.has(d.shape) ? "pointer" : "default");

  // Grow animation
  bars.transition()
    .delay((d, i) => i * 60)
    .duration(900)
    .ease(d3.easeCubicOut)
    .attr("y", d => y(d.count))
    .attr("height", d => y(0) - y(d.count));

  // Label bottom
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 35)
    .attr("text-anchor", "middle")
    .style("fill", "white")
    .style("font-size", "18px")
    .text("Shapes")
    .style("opacity", 0)
    .transition().delay(500).duration(700).style("opacity", 1);

  // annotation

  const panelX = width * 0.40;
  const panelY = height * 0.10;
  const panelWidth = width * 0.58;
  const panelHeight = 160;

  const panel = svg.append("g")
    .attr("class", "annotation-panel")
    .attr("transform", `translate(${panelX}, ${panelY})`)
    .style("opacity", 0);

  // Background rounded rectangle
  panel.append("rect")
    .attr("width", panelWidth)
    .attr("height", panelHeight)
    .attr("rx", 22)
    .attr("ry", 22)
    .attr("fill", "#141927")
    .attr("stroke", "#2c354f")
    .attr("stroke-width", 2)
    .attr("opacity", 0.92);

  // Circle icon
  const circle = panel.append("circle")
    .attr("cx", 80)
    .attr("cy", panelHeight / 2)
    .attr("r", 58)
    .attr("fill", "#d6d6d6");

  // Title + description
  const title = panel.append("text")
    .attr("x", 160)
    .attr("y", 60)
    .attr("fill", "white")
    .style("font-size", "20px")
    .style("font-weight", 600);

  const body = panel.append("text")
    .attr("x", 160)
    .attr("y", 75)
    .attr("fill", "white")
    .style("font-size", "16px")
    .style("line-height", 1.4);

  // Word wrapping helper
  function wrapText(textSel, text, width) {
  const words = text.split(/\s+/); 
  let line = [];
  let lineNumber = 0;
  const lineHeight = 1.2; // em units

  textSel.text(null);

  let tspan = textSel.append("tspan")
    .attr("x", 160)
    .attr("dy", "1.2em");

  words.forEach(word => {
    const testLine = [...line, word].join(" ");

    tspan.text(testLine);

    // If too wide → commit previous line and start a new one
    if (tspan.node().getComputedTextLength() > width) {

      // Write *previous* line
      tspan.text(line.join(" "));

      // Start new line with the current word
      line = [word];

      tspan = textSel.append("tspan")
        .attr("x", 160)
        .attr("dy", lineHeight + "em")
        .text(word);
    } else {
      // Safe to add the word
      line.push(word);
    }
  });
}

  let selected = null;

  // Bar clicking function 

  bars.on("click", (event, d) => {
    if (!top5Set.has(d.shape)) return;

    selected = d.shape;

    bars.attr("filter", null);
    d3.select(event.currentTarget).attr("filter", "url(#glow)");

    title.text(`Shape: ${d.shape.charAt(0).toUpperCase() + d.shape.slice(1)}`);
    wrapText(body, descriptions[d.shape], panelWidth - 200);

    panel.transition().duration(350).style("opacity", 1);
  });
}

// New duration histogram=============================================================

d3.csv("dataset/ufo_sightings.csv").then(data => {

  // Parse duration column
  const durations = data
    .map(d => +d["Data.Encounter duration"])
    .filter(d => d > 0 && !isNaN(d));

  // Compute 95th percentile cutoff
  const p95 = d3.quantile(durations.slice().sort(d3.ascending), 0.95);
  const trimmed = durations.filter(d => d <= p95);

  // SVG setup
  const svg = d3.select("#chart");
  const width = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 40, right: 40, bottom: 60, left: 60 };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // X scale
  const x = d3.scaleLinear()
    .domain([0, d3.max(trimmed)])
    .nice()
    .range([0, innerWidth]);

  // More X-axis ticks (15 ticks)
  const xAxis = d3.axisBottom(x)
    .ticks(15)
    .tickSizeOuter(0);

  // Histogram bins
  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(40)(trimmed);

  // Y scale
  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .nice()
    .range([innerHeight, 0]);

  const yAxis = d3.axisLeft(y)
    .ticks(10)
    .tickSizeOuter(0);

  // Bars
  g.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => x(d.x0))
    .attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr("height", d => innerHeight - y(d.length))
    .attr("fill", "#4DA3FF");

  // X Axis (white)
  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .call(g => g.selectAll("text").attr("fill", "white"))
    .call(g => g.selectAll("line").attr("stroke", "white"))
    .call(g => g.selectAll("path").attr("stroke", "white"))
    .append("text")
      .attr("x", innerWidth / 2)
      .attr("y", 45)
      .attr("fill", "white")
      .attr("text-anchor", "middle")
      .text("Encounter Duration (seconds)");

  // Y Axis (white)
  g.append("g")
    .call(yAxis)
    .call(g => g.selectAll("text").attr("fill", "white"))
    .call(g => g.selectAll("line").attr("stroke", "white"))
    .call(g => g.selectAll("path").attr("stroke", "white"))
    .append("text")
      .attr("x", -40)
      .attr("y", -20)
      .attr("fill", "white")
      .attr("text-anchor", "start")
      .text("Count");
});

