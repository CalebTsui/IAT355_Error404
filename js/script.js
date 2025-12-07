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

    // last 20 years
    const currentYear = new Date().getFullYear();
    const ufoRecent = ufoClean.filter(d => d.year >= currentYear - 20);

    // 1. Initialize map
    const map = L.map("ufoMap").setView([37.8, -96.0], 4);

    // 2. Add OpenStreetMap tiles
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    // 3. Create a marker cluster group
    const markers = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 60
    });

    // 4. Add UFO sightings to cluster
    ufoRecent.forEach(d => {
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

    // 5. Add cluster layer to map
    map.addLayer(markers);

    // 6. Adjust map view to fit all points
    if (markers.getLayers().length > 0) {
        map.fitBounds(markers.getBounds());
    }
});

function drawTimeline(ufoData) {

    // ============================
    // 1. USER GUESS HANDLING
    // ============================

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

    // ============================
    // 2. NORMAL TIMELINE DRAWING
    // ============================
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

        // ============================
        // 3. HIGHLIGHT USER GUESS
        // ============================

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
