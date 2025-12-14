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

fetchData().then(({ naMap, ufoClean }) => {

    // Limit data from 1995–2014
    const minYear = 1995;
    const maxYear = 2014;

    // Keep only specific years
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
    slider.min = minYear;        // set slider min
    slider.max = maxYear;        // set slider max
    slider.value = minYear;      // initial value

    const yearLabel = document.getElementById("yearLabel");
    yearLabel.innerHTML = `<b>Showing up to year: ${minYear}</b>`;

    slider.addEventListener("input", () => {
        const selectedYear = parseInt(slider.value);
        yearLabel.innerHTML = `<b>Showing up to year: ${selectedYear}</b>`;
        updateMap(selectedYear);
    });

    // Initial load
    updateMap(minYear);

});


// GLOBAL tooltip (only created once)
let tooltip = d3.select("#globalTooltip");
if (tooltip.empty()) {
    tooltip = d3.select("body")
        .append("div")
        .attr("id", "globalTooltip")
        .style("position", "absolute")
        .style("background", "white")
        .style("padding", "6px 12px")
        .style("border-radius", "6px")
        .style("font-size", "14px")
        .style("pointer-events", "none")
        .style("box-shadow", "0px 0px 10px rgba(0,0,0,0.2)")
        .style("opacity", 0);
}

let lastGuessedYear = null;
let firstRender = true; // animations only on first load

// --------------------------------------------------
// MAIN FUNCTION
// --------------------------------------------------
function drawTimeline(ufoData) {

    const guessContainer = document.getElementById("guessContainer");
    const timelineWrapper = document.getElementById("timelineWrapper");
    const guessInput = document.getElementById("guessInput");
    const guessBtn = document.getElementById("guessBtn");
    const guessError = document.getElementById("guessError");

    const minYear = 1995;
    const maxYear = 2014;

    guessBtn.onclick = () => {
        const guessedYear = +guessInput.value;

        if (isNaN(guessedYear) || guessedYear < minYear || guessedYear > maxYear) {
            guessError.style.display = "block";
            return;
        }

        guessError.style.display = "none";
        guessContainer.style.display = "none";
        timelineWrapper.style.display = "block";

        lastGuessedYear = guessedYear;
        renderTimeline(guessedYear);
    };

    // ------------------------------
    // DEBOUNCED RESIZE HANDLER
    // ------------------------------
    window.addEventListener("resize", debounce(() => {
        if (lastGuessedYear !== null) {
            d3.select("#timelineChart").selectAll("*").remove();
            renderTimeline(lastGuessedYear);
        }
    }, 200));


    // --------------------------------------------------
    // RENDER FUNCTION (FULLY RESPONSIVE)
    // --------------------------------------------------
    function renderTimeline(guessedYear) {

        const currentYear = new Date().getFullYear();
        const filtered = ufoData.filter(d => d.year >= currentYear - 30);

        const sightingsByYear = d3.rollups(
            filtered,
            v => v.length,
            d => d.year
        )
        .map(([year, count]) => ({ year: +year, count }))
        .sort((a, b) => d3.ascending(a.year, b.year));

        // Responsive layout
        const container = document.getElementById("timelineChart");
        const containerWidth = container.clientWidth;

        const margin = { top: 40, right: 40, bottom: 60, left: 70 };

        const width = containerWidth - margin.left - margin.right;
        const height = width * 0.55;  // responsive height ratio

        // Clear chart
        d3.select("#timelineChart").selectAll("*").remove();

        const svg = d3.select("#timelineChart")
            .append("svg")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .classed("responsive-svg", true)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const x = d3.scaleLinear()
            .domain(d3.extent(sightingsByYear, d => d.year))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(sightingsByYear, d => d.count)])
            .nice()
            .range([height, 0]);

        // Axes (reduced ticks on small screens)
        const tickCount = width < 500 ? 5 : 10;

        svg.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(
                d3.axisBottom(x)
                .ticks(tickCount)
                .tickFormat(d3.format("d"))
            );

        svg.append("g").call(d3.axisLeft(y));

        // Line generator
        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d.count))
            .curve(d3.curveMonotoneX);

        // Line path
        const linePath = svg.append("path")
            .datum(sightingsByYear)
            .attr("fill", "none")
            .attr("stroke", "#374ABC")
            .attr("stroke-width", 2.5)
            .attr("d", line);

        // Animate only first time
        if (firstRender) {
            const totalLength = linePath.node().getTotalLength();
            linePath
                .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
                .attr("stroke-dashoffset", totalLength)
                .transition()
                .duration(2000)
                .ease(d3.easeCubic)
                .attr("stroke-dashoffset", 0);
        }

        // Dots
        const dots = svg.selectAll("circle.dot")
            .data(sightingsByYear)
            .enter()
            .append("circle")
            .attr("class", "dot")
            .attr("cx", d => x(d.year))
            .attr("cy", d => y(d.count))
            .attr("r", 5)
            .attr("fill", "#7DCBCD");

        if (firstRender) {
            dots.style("opacity", 0)
                .transition()
                .delay(2000)
                .duration(600)
                .style("opacity", 1);
        }

        dots.on("mouseover", (event, d) => {
                tooltip.style("opacity", 1)
                    .html(`<b>${d.year}</b><br>${d.count} sightings`);
            })
            .on("mousemove", event => {
                tooltip.style("left", event.pageX + 15 + "px")
                       .style("top", event.pageY - 28 + "px");
            })
            .on("mouseout", () => tooltip.style("opacity", 0));

        // annotation
        const annotationYear = 2012;
        const annotationX = x(annotationYear);

        svg.append("line")
            .attr("x1", annotationX)
            .attr("y1", height)
            .attr("x2", annotationX)
            .attr("y2", 0)
            .attr("stroke", "#E8EB77")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "6 4");

        const annoGroup = svg.append("g")
            .attr("transform", `translate(${annotationX - 270}, ${y(6000) - 50})`);

        annoGroup.append("rect")
            .attr("width", 250)
            .attr("height", 105)
            .attr("rx", 12)
            .attr("fill", "#141927")
            .attr("stroke", "#2c354f")
            .attr("stroke-width", 2)
            .attr("opacity", 0.92);

        const textLines = [
            "2012 shows a significant peak with",
            "6,096 reports, marking an increase of",
            "over 2,000 sightings compared to",
            "previous years."
        ];

        textLines.forEach((t, i) => {
            annoGroup.append("text")
                .attr("x", 18)
                .attr("y", 25 + i * 20)
                .attr("fill", "white")
                .style("font-size", "14px")
                .text(t);
        });

        // user guess stuff
        const guessedData = sightingsByYear.find(d => d.year === guessedYear);

        if (guessedData) {
            svg.append("circle")
                .attr("cx", x(guessedYear))
                .attr("cy", y(guessedData.count))
                .attr("r", 10)
                .attr("fill", "gold")
                .attr("stroke", "white")
                .attr("stroke-width", 2)
                .on("mouseover", () => {
                    tooltip.style("opacity", 1)
                        .html(`<b>Your Guess: ${guessedYear}</b><br>${guessedData.count} sightings`);
                })
                .on("mousemove", e => {
                    tooltip.style("left", e.pageX + 15 + "px").style("top", e.pageY - 28 + "px");
                })
                .on("mouseout", () => tooltip.style("opacity", 0));

            svg.append("text")
                .attr("x", x(guessedYear))
                .attr("y", y(guessedData.count) - 25)
                .attr("text-anchor", "middle")
                .attr("fill", "gold")
                .style("font-size", "14px")
                .text("Your guess");
        }

        // Labels
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

        firstRender = false; // animations only once
    }
}

function debounce(fn, delay) {
    let timeout;
    return function () {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, arguments), delay);
    };
}



fetchData().then(({ ufoClean }) => {

    const shapeMap = L.map("shapeMap").setView([37.8, -96.0], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(shapeMap);

    let markers = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    shapeMap.addLayer(markers);

    const minYear = 1995;
    const maxYear = 2014;

    const ufoRange = ufoClean.filter(d =>
        d.year >= minYear && d.year <= maxYear
    );

    // Insights
    const shapeInsights = {
        light: `Light sightings are the most common and follow population density. High concentrations in California, Florida, Washington, and New York reflect overall reporting volume rather than a shape-specific hotspot.`,
        circle: `Circle sightings are numerically high in West Coast states (California, Washington) though the Northeast may appear denser on the map due to geographic compression. California leads in total circle reports.`,
        triangle: `Triangle sightings are relatively common in Texas, Washington, Arizona, Ohio, and Pennsylvania. These inland concentrations overlap with major aviation and military flight corridors and merit further investigation.`,
        fireball: `Fireball sightings cluster in California, Florida, Washington, Arizona, and Texas. The pattern reflects both clear-sky viewing conditions in the West and large coastal populations reporting meteors or bright atmospheric events.`,
        disk: `Disk sightings show a Pacific Northwest skew, with notable counts in California, Washington, and Oregon. This shape is more regionally concentrated than others.`
    };
    const insightDiv = document.getElementById("shapeInsight");

    // Dropdown listener
    const shapeSelect = document.getElementById("shapeSelect");
    shapeSelect.addEventListener("change", () => {
        const selectedShape = shapeSelect.value;
        updateShapeMap(selectedShape);
    });

    function updateShapeMap(shape) {
        markers.clearLayers();

        const filtered = ufoRange.filter(
            d => d.shape.toLowerCase() === shape.toLowerCase()
        );

        filtered.forEach(d => {
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
                    <b>Duration:</b> ${d.duration} sec
                `);

                markers.addLayer(marker);
            }
        });

        if (shapeInsights[shape]) {
            insightDiv.innerText = shapeInsights[shape];
        } else {
            insightDiv.innerText = `No prewritten insight available for "${shape}".`;
        }
    }
    
    updateShapeMap(shapeSelect.value);
});



//neal stuff

// visualization loading data

let barData = null;

d3.csv("dataset/ufo_sightings.csv").then(data => {
  data.forEach(d => {
    d.year = +d["Dates.Sighted.Year"];
    d.duration = +d["Data.Encounter duration"];
    d.shape = d["Data.Shape"]?.trim();
  });

  const filtered = data.filter(d => d.year >= 1995 && d.year <= 2014);
  barData = filtered;
  renderBarChart(barData);
});

function renderBarChart(raw) {
  const container = d3.select("#bars");
  container.selectAll("*").remove();

  const containerWidth = container.node().clientWidth;
  let width = containerWidth;
  let height;

  if (containerWidth <= 600) height = 350;
  else if (containerWidth <= 1024) height = 450;
  else height = 480;

  const margin = { top: 20, right: 20, bottom: 80, left: 80 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Clean shapes
  const shapes = raw
    .map(d => (d["Data.Shape"] || "").trim())
    .filter(s => s && s.toLowerCase() !== "unknown" && s.toLowerCase() !== "other");

  const counts = Array.from(
    d3.rollup(shapes, v => v.length, d => d),
    ([shape, count]) => ({ shape, count })
  ).sort((a, b) => d3.descending(a.count, b.count));

  const top5 = counts.slice(0, 5).map(d => d.shape);
  const top5Set = new Set(top5);

  const descriptions = {
    light: "The light shape is like a burst of light that just flashes through really quick.",
    triangle: "Triangular sightings are often described as silent, large, and slow-moving.",
    circle: "Circular sightings are one of the classic UFO shapes, often bright and hovering.",
    fireball: "Fireball sightings appear as blazing balls of light moving rapidly.",
    sphere: "Spherical craft are often described as smooth, bright, and floating silently."
  };

  const shapeIcons = {
    light: "assets/images/light.png",
    triangle: "assets/images/triangle.png",
    circle: "assets/images/circle.png",
    fireball: "assets/images/fireball.png",
    sphere: "assets/images/sphere.png"
  };

  // drawing bars
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleBand()
    .domain(counts.map(d => d.shape))
    .range([margin.left, width - margin.right])
    .padding(0.12);

  const y = d3.scaleLinear()
    .domain([0, d3.max(counts, d => d.count) || 1]).nice()
    .range([innerHeight, margin.top]);

  // Axes
  const xAxis = svg.append("g")
    .attr("transform", `translate(0, ${innerHeight})`)
    .call(d3.axisBottom(x).ticks(containerWidth < 600 ? 4 : 6));

  xAxis.selectAll("text")
    .attr("transform", "rotate(-45)")
    .attr("text-anchor", "end")
    .style("fill", "white")
    .style("font-size", containerWidth < 600 ? "12px" : "15px");

  const yAxis = svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(containerWidth < 600 ? 4 : 6));

  yAxis.selectAll("text")
    .style("fill", "white")
    .style("font-size", containerWidth < 600 ? "12px" : "14px");

  // Bars
  const bars = svg.append("g")
    .selectAll("rect")
    .data(counts)
    .join("rect")
      .attr("x", d => x(d.shape))
      .attr("width", x.bandwidth())
      .attr("y", y(0))
      .attr("height", 0)
      .attr("fill", "#7DCBCD")
      .attr("opacity", d => top5Set.has(d.shape) ? 1 : 0.45)
      .style("rx", 6)
      .style("ry", 6)
      .style("cursor", d => top5Set.has(d.shape) ? "pointer" : "default");

  bars.transition()
    .delay((d,i) => i*60)
    .duration(900)
    .ease(d3.easeCubicOut)
    .attr("y", d => y(d.count))
    .attr("height", d => innerHeight - y(d.count));

  d3.select("#annotation-panel").remove();

  // annotation
const panel = container.append("div")
    .attr("id", "annotation-panel")
    .style("width", "100%")
    .style("margin-bottom", "25px")
    .style("padding", "15px")
    .style("background", "#141927")
    .style("border", "2px solid #2c354f")
    .style("border-radius", "15px")
    .style("color", "white")
    .style("min-height", containerWidth < 600 ? "130px" : "160px")
    .style("box-sizing", "border-box")
    .style("display", "none")  // hidden initially
    .style("align-items", "center")  // vertically center content
    .style("justify-content", "flex-start"); // keep icon left

const panelIcon = panel.append("img")
    .attr("id", "panel-icon")
    .attr("src", "images/default.png")
    .style("width", containerWidth < 400 ? "60px" : "90px")
    .style("height", containerWidth < 400 ? "60px" : "90px") // perfect square
    .style("flex-shrink", 0)
    .style("margin-right", "15px")
    .style("object-fit", "cover"); // ensures square image fits

const panelContent = panel.append("div")
    .style("flex-grow", 1)
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("justify-content", "center"); // vertically center text

const panelTitle = panelContent.append("div")
    .attr("id", "panel-title")
    .style("font-size", containerWidth < 600 ? "14px" : "20px")
    .style("font-weight", "600");

const panelCount = panelContent.append("div")
    .attr("id", "panel-count")
    .style("font-size", containerWidth < 600 ? "12px" : "16px")
    .style("color", "#A7B2CE");

const panelBody = panelContent.append("div")
    .attr("id", "panel-body")
    .style("font-size", containerWidth < 600 ? "12px" : "16px")
    .style("line-height", 1.4)
    .style("margin-top", "5px");

// -----------------------------
// Bar click event
// -----------------------------
bars.on("click", (event, d) => {
    if (!top5Set.has(d.shape)) return;

    // Show the panel only on click
    panel.style("display", "flex");  

    // Update panel content
    panelIcon.attr("src", shapeIcons[d.shape] || "images/default.png");
    panelTitle.text(`Shape: ${d.shape.charAt(0).toUpperCase() + d.shape.slice(1)}`);
    panelCount.text(`Total Sightings: ${d.count}`);
    panelBody.text(descriptions[d.shape]);
});



  // white axes 
  xAxis.selectAll("text")
      .attr("transform", "rotate(-45)")
      .attr("text-anchor", "end")
      .attr("dy", "0.4em")
      .style("fill", "white")
      .style("font-size", containerWidth < 600 ? "12px" : "15px");

  xAxis.selectAll("line")
      .style("stroke", "white")
      .style("stroke-width", 1);

  xAxis.selectAll("path")
      .style("stroke", "white")
      .style("stroke-width", 1);

  yAxis.selectAll("text")
      .style("fill", "white")
      .style("font-size", containerWidth < 600 ? "12px" : "14px");

  yAxis.selectAll("line")
      .style("stroke", "white")
      .style("stroke-width", 1);

  yAxis.selectAll("path")
      .style("stroke", "white")
      .style("stroke-width", 1);

}

window.addEventListener("resize", () => {
  if (barData) renderBarChart(barData);
});


// UFO DURATION HISTOGRAM (0–95th percentile trimmed)
function renderHistogram(data) {

  const container = document.getElementById("chartWrapper");
  const svg = d3.select("#chart");

  const containerWidth = container.clientWidth;

  if (containerWidth === 0) return;

  // Responsive breakpoints
  let width = containerWidth;
  let height;

  if (containerWidth <= 600) {
    // MOBILE
    height = 300;
  } else if (containerWidth <= 1024) {
    // TABLET
    height = 400;
  } else {
    // DESKTOP
    height = 500;
  }

  svg.attr("width", width).attr("height", height);

  // Margins
  const margin = { top: 40, right: 30, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Clear previous rendering
  svg.selectAll("*").remove();

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Get trimmed durations (already passed from caller)
  const durations = data
    .map(d => +d["Data.Encounter duration"])
    .filter(d => d > 0 && !isNaN(d));

  const p95 = d3.quantile(durations.slice().sort(d3.ascending), 0.95);
  const trimmed = durations.filter(d => d <= p95);

  // X scale
  const x = d3.scaleLinear()
    .domain([0, d3.max(trimmed)])
    .nice()
    .range([0, innerWidth]);

  const xAxis = d3.axisBottom(x)
    .ticks(width < 600 ? 6 : 12) // fewer ticks on mobile
    .tickSizeOuter(0);

  // Bins
  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(width < 600 ? 20 : 40) // fewer bins on mobile
    (trimmed);

  // Y scale
  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .nice()
    .range([innerHeight, 0]);

  const yAxis = d3.axisLeft(y)
    .ticks(width < 600 ? 5 : 10)
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
    .attr("fill", "#7DCBCD");

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
}

let globalData = null;

d3.csv("dataset/ufo_sightings.csv").then(data => {
  globalData = data;
  renderHistogram(globalData);
});

// Auto-redraw on window resize
window.addEventListener("resize", () => {
  if (globalData) renderHistogram(globalData);
});
