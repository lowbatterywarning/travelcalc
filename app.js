(function () {
  "use strict";

  // ==================== DOM References ====================
  const $ = function (id) { return document.getElementById(id); };

  const form = $("tripForm");
  const calculateBtn = $("calculateBtn");
  const btnText = calculateBtn.querySelector(".btn-text");
  const btnSpinner = $("btnSpinner");
  const globalError = $("globalError");
  const resultsSection = $("resultsSection");
  const summaryGrid = $("summaryGrid");
  const disclaimerNotes = $("disclaimerNotes");
  const costTable = $("costTable");
  const mapDiv = $("map");
  const downloadPdfBtn = $("downloadPdfBtn");
  const newCalcBtn = $("newCalcBtn");

  const startAddress = $("startAddress");
  const endAddress = $("endAddress");
  const startDate = $("startDate");
  const endDate = $("endDate");
  const ratePerMile = $("ratePerMile");

  // ==================== State ====================
  var state = {
    startGeo: null,
    endGeo: null,
    distanceMeters: 0,
    distanceMiles: 0,
    durationSeconds: 0,
    routeGeometry: null,
    perDiemRate: 0,
    perDiemLocation: null,
    perDiemNote: "",
    mileageCost: 0,
    perDiemCost: 0,
    totalCost: 0,
    days: 0,
    isHaversine: false,
    mapInstance: null,
    routeLayer: null,
    polylineCoords: null
  };

  // ==================== Helpers ====================
  function showSpinner() {
    btnText.classList.add("hidden");
    btnSpinner.classList.remove("hidden");
    calculateBtn.disabled = true;
  }

  function hideSpinner() {
    btnText.classList.remove("hidden");
    btnSpinner.classList.add("hidden");
    calculateBtn.disabled = false;
  }

  function showGlobalError(msg) {
    globalError.textContent = msg;
    globalError.classList.remove("hidden");
  }

  function hideGlobalError() {
    globalError.textContent = "";
    globalError.classList.add("hidden");
  }

  function showFieldError(fieldId, msg) {
    var el = $(fieldId);
    var input = el.previousElementSibling;
    if (input && input.tagName === "INPUT") {
      input.classList.add("input-error");
    }
    el.textContent = msg;
    el.classList.add("visible");
  }

  function clearFieldErrors() {
    var errors = document.querySelectorAll(".error-msg");
    errors.forEach(function (e) {
      e.textContent = "";
      e.classList.remove("visible");
    });
    var inputs = document.querySelectorAll(".input-error");
    inputs.forEach(function (i) {
      i.classList.remove("input-error");
    });
  }

  function formatCurrency(val) {
    return "$" + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatDistance(miles) {
    return miles.toFixed(1) + " mi";
  }

  function formatDuration(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
      return h + " hr " + m + " min";
    }
    return m + " min";
  }

  function formatDate(dateStr) {
    if (!dateStr) { return ""; }
    var parts = dateStr.split("-");
    var d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }

  // ==================== Form Validation ====================
  function validateForm() {
    clearFieldErrors();
    hideGlobalError();
    var valid = true;

    if (!startAddress.value.trim()) {
      showFieldError("startAddressError", "Please enter a starting address.");
      valid = false;
    }
    if (!endAddress.value.trim()) {
      showFieldError("endAddressError", "Please enter a destination address.");
      valid = false;
    }
    if (!startDate.value) {
      showFieldError("startDateError", "Please select a start date.");
      valid = false;
    }
    if (!endDate.value) {
      showFieldError("endDateError", "Please select an end date.");
      valid = false;
    }
    if (startDate.value && endDate.value) {
      var sdParts = startDate.value.split("-");
      var edParts = endDate.value.split("-");
      var sd = new Date(Date.UTC(parseInt(sdParts[0], 10), parseInt(sdParts[1], 10) - 1, parseInt(sdParts[2], 10)));
      var ed = new Date(Date.UTC(parseInt(edParts[0], 10), parseInt(edParts[1], 10) - 1, parseInt(edParts[2], 10)));
      if (ed < sd) {
        showFieldError("endDateError", "End date must be on or after start date.");
        valid = false;
      }
    }
    var rate = parseFloat(ratePerMile.value);
    if (isNaN(rate) || rate <= 0) {
      showFieldError("rateError", "Rate must be a positive number.");
      valid = false;
    }

    return valid;
  }

  // ==================== Geocoding (Nominatim) ====================
  function geocodeAddress(address) {
    var url = "https://nominatim.openstreetmap.org/search?format=json&q="
      + encodeURIComponent(address)
      + "&limit=1&addressdetails=1";

    return fetch(url, {
      headers: { "User-Agent": "TravelCalculator/1.0 (personal project)" }
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Nominatim returned status " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || data.length === 0) {
          throw new Error("Address not found: " + address);
        }
        var r = data[0];
        var addr = r.address || {};
        return {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          displayName: r.display_name,
          city: addr.city || addr.town || addr.village || addr.hamlet || "",
          county: addr.county || "",
          state: addr.state || "",
          stateCode: (addr["ISO3166-2-lvl4"] || "").split("-").pop() || getStateCode(addr.state || "")
        };
      });
  }

  function getStateCode(stateName) {
    var map = {
      "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
      "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
      "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
      "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
      "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME",
      "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
      "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
      "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
      "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
      "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
      "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
      "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
      "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY"
    };
    return map[stateName] || "";
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // ==================== OSRM Distance ====================
  function getOSRMRoute(lon1, lat1, lon2, lat2) {
    var url = "https://router.project-osrm.org/route/v1/driving/"
      + lon1 + "," + lat1 + ";" + lon2 + "," + lat2
      + "?overview=full&geometries=polyline";

    return fetch(url)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("OSRM returned status " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.routes || data.routes.length === 0) {
          throw new Error("No route found between the locations.");
        }
        var route = data.routes[0];
        return {
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          geometry: route.geometry
        };
      });
  }

  // ==================== Haversine Fallback ====================
  function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 6371000; // Earth radius in meters
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ==================== Polyline Decoder ====================
  function decodePolyline(str) {
    var index = 0;
    var lat = 0;
    var lng = 0;
    var coordinates = [];

    while (index < str.length) {
      var shift = 0;
      var result = 0;
      var byte;
      do {
        byte = str.charCodeAt(index) - 63;
        index++;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      var deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += deltaLat;

      shift = 0;
      result = 0;
      do {
        byte = str.charCodeAt(index) - 63;
        index++;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      var deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += deltaLng;

      coordinates.push([lat * 1e-5, lng * 1e-5]);
    }

    return coordinates;
  }

  // ==================== Per Diem Lookup ====================
  var perDiemData = null;

  function loadPerDiemData() {
    if (perDiemData) {
      return Promise.resolve(perDiemData);
    }
    return fetch("per-diem.json")
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Failed to load per diem data.");
        }
        return res.json();
      })
      .then(function (data) {
        perDiemData = data;
        return data;
      });
  }

  function lookupPerDiem(geo, tripStartDate, tripEndDate) {
    if (!perDiemData) { return null; }

    var stateCode = geo.stateCode;
    var city = (geo.city || "").trim();
    var county = (geo.county || "").trim();

    // Normalize strings for matching
    var cityLower = city.toLowerCase();
    var countyLower = county.toLowerCase();

    var locations = perDiemData.locations[stateCode];
    if (!locations || locations.length === 0) {
      return {
        lodging: perDiemData.standardRate.lodging,
        meals: perDiemData.standardRate.meals,
        dailyRate: perDiemData.standardRate.lodging + perDiemData.standardRate.meals,
        locationName: "Standard CONUS Rate",
        isStandard: true
      };
    }

    // Try exact city match first, then county match
    var bestMatch = null;
    var bestScore = 0;

    for (var i = 0; i < locations.length; i++) {
      var loc = locations[i];
      var locCity = (loc.city || "").trim().toLowerCase();
      var locCounty = (loc.county || "").trim().toLowerCase();
      var score = 0;

      // Exact city match = highest priority
      if (locCity === cityLower) {
        score = 100;
      } else if (cityLower.indexOf(locCity) !== -1 || locCity.indexOf(cityLower) !== -1) {
        score = 70;
      }

      // County match
      if (locCounty === countyLower) {
        score += 30;
      } else if (countyLower.indexOf(locCounty) !== -1 || locCounty.indexOf(countyLower) !== -1) {
        score += 15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = loc;
      }
    }

    if (bestMatch) {
      // Check for seasonal rates
      var seasonalRate = getSeasonalRate(bestMatch, stateCode, tripStartDate, tripEndDate);
      if (seasonalRate) {
        return seasonalRate;
      }

      return {
        lodging: bestMatch.lodging,
        meals: bestMatch.meals,
        dailyRate: bestMatch.lodging + bestMatch.meals,
        locationName: bestMatch.city + ", " + stateCode,
        isStandard: false
      };
    }

    // Fallback to standard CONUS
    return {
      lodging: perDiemData.standardRate.lodging,
      meals: perDiemData.standardRate.meals,
      dailyRate: perDiemData.standardRate.lodging + perDiemData.standardRate.meals,
      locationName: "Standard CONUS Rate (no specific match for " + city + ", " + stateCode + ")",
      isStandard: true
    };
  }

  function getSeasonalRate(location, stateCode, tripStartDate, tripEndDate) {
    if (!location.seasonStart || !location.seasonEnd) {
      return null;
    }

    // Parse season dates (month-day format)
    var seasonStart = parseMonthDay(location.seasonStart);
    var seasonEnd = parseMonthDay(location.seasonEnd);

    // Parse trip dates into [year, month, day] to avoid timezone issues
    var startParts = tripStartDate.split("-");
    var endParts = tripEndDate.split("-");
    var startY = parseInt(startParts[0], 10);
    var startM = parseInt(startParts[1], 10);
    var startD = parseInt(startParts[2], 10);
    var endY = parseInt(endParts[0], 10);
    var endM = parseInt(endParts[1], 10);
    var endD = parseInt(endParts[2], 10);

    // Handle cross-year seasons (e.g., Dec 1 to Mar 31)
    var isCrossYear = seasonStart > seasonEnd;

    // Iterate day by day using numeric date comparison
    var d = new Date(Date.UTC(startY, startM - 1, startD));
    var end = new Date(Date.UTC(endY, endM - 1, endD));

    while (d <= end) {
      var md = d.getUTCMonth() * 100 + d.getUTCDate();

      var inSeason = false;
      if (isCrossYear) {
        inSeason = md >= seasonStart || md <= seasonEnd;
      } else {
        inSeason = md >= seasonStart && md <= seasonEnd;
      }

      if (inSeason) {
        return {
          lodging: location.seasonLodging,
          meals: location.seasonMeals,
          dailyRate: location.seasonLodging + location.seasonMeals,
          locationName: location.city + ", " + stateCode + " (Seasonal Rate)",
          isStandard: false
        };
      }

      d.setUTCDate(d.getUTCDate() + 1);
    }

    return null;
  }

  function parseMonthDay(str) {
    // str is "MM-DD"
    var parts = str.split("-");
    var month = parseInt(parts[0], 10); // 1-12
    var day = parseInt(parts[1], 10);   // 1-31
    return (month - 1) * 100 + day;     // 0..11 * 100 + day
  }

  // ==================== Calculation ====================
  function calculateCosts() {
    state.distanceMiles = state.distanceMeters / 1609.344;
    var rate = parseFloat(ratePerMile.value);

    // Parse dates as UTC to avoid timezone issues
    var sParts = startDate.value.split("-");
    var eParts = endDate.value.split("-");
    var sd = new Date(Date.UTC(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10)));
    var ed = new Date(Date.UTC(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10)));
    state.days = Math.max(1, Math.round((ed - sd) / 86400000) + 1);

    state.mileageCost = state.distanceMiles * rate;
    state.perDiemCost = state.perDiemRate * state.days;
    state.totalCost = state.mileageCost + state.perDiemCost;
  }

  // ==================== Results Display ====================
  function displayResults() {
    // Summary Grid
    var perDiemLabel = state.perDiemLocation
      ? state.perDiemLocation.locationName
      : "Standard CONUS Rate";

    var summaryItems = [
      { label: "From", value: state.startGeo.displayName },
      { label: "To", value: state.endGeo.displayName },
      { label: "Start Date", value: formatDate(startDate.value) },
      { label: "End Date", value: formatDate(endDate.value) },
      { label: "Duration", value: state.days + " day" + (state.days !== 1 ? "s" : "") },
      { label: "Distance", value: formatDistance(state.distanceMiles) },
      { label: "Rate per Mile", value: formatCurrency(parseFloat(ratePerMile.value)) },
      { label: "Per Diem Rate", value: formatCurrency(state.perDiemRate) + "/day" }
    ];

    var html = "";
    for (var i = 0; i < summaryItems.length; i++) {
      html += "<div class=\"summary-item\">"
        + "<div class=\"summary-label\">" + escapeHtml(summaryItems[i].label) + "</div>"
        + "<div class=\"summary-value\">" + escapeHtml(summaryItems[i].value) + "</div>"
        + "</div>";
    }
    summaryGrid.innerHTML = html;

    // Disclaimer notes
    var notes = [];
    if (state.isHaversine) {
      notes.push("\u26A0\uFE0F Distance is an approximate straight-line (as-the-crow-flies) calculation. "
        + "The road distance server was unavailable.");
    }
    if (state.perDiemLocation && state.perDiemLocation.isStandard) {
      notes.push("\u2139\uFE0F " + state.perDiemLocation.locationName);
    }
    if (!state.perDiemLocation) {
      notes.push("\u2139\uFE0F Per diem rate not available; using standard CONUS rate ($178/day).");
    }
    disclaimerNotes.innerHTML = notes.length > 0
      ? notes.join("<br>")
      : "";

    // Cost table
    costTable.innerHTML = ""
      + "<div class=\"cost-row\">"
      + "<span class=\"cost-label\">Mileage Cost</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.mileageCost) + "</span>"
      + "</div>"
      + "<div class=\"cost-row\">"
      + "<span class=\"cost-label\">Per Diem Cost (" + state.days + " day" + (state.days !== 1 ? "s" : "") + ")</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.perDiemCost) + "</span>"
      + "</div>"
      + "<div class=\"cost-row total\">"
      + "<span class=\"cost-label\">Total Estimated Cost</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.totalCost) + "</span>"
      + "</div>";

    // Show results
    resultsSection.classList.remove("hidden");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

    // Render map
    renderMap();
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ==================== Map ====================
  function renderMap() {
    // Clean up previous map
    if (state.mapInstance) {
      state.mapInstance.remove();
      state.mapInstance = null;
    }

    // Ensure map container is visible
    mapDiv.innerHTML = "";

    var startLatLng = [state.startGeo.lat, state.startGeo.lon];
    var endLatLng = [state.endGeo.lat, state.endGeo.lon];

    // Create map
    var map = L.map("map", {
      attributionControl: true
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
      crossOrigin: true,
      maxZoom: 19
    }).addTo(map);

    // Start marker
    L.marker(startLatLng)
      .addTo(map)
      .bindPopup("<strong>Start:</strong> " + escapeHtml(state.startGeo.displayName));

    // End marker
    L.marker(endLatLng)
      .addTo(map)
      .bindPopup("<strong>Destination:</strong> " + escapeHtml(state.endGeo.displayName));

    // Route polyline
    var coords;
    if (state.polylineCoords && state.polylineCoords.length > 0) {
      coords = state.polylineCoords;
    } else {
      // Fallback: straight line
      coords = [startLatLng, endLatLng];
    }

    state.routeLayer = L.polyline(coords, {
      color: "#2563eb",
      weight: 5,
      opacity: 0.7,
      lineJoin: "round"
    }).addTo(map);

    // Fit bounds
    var bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [40, 40] });

    state.mapInstance = map;

    // Fix map rendering if it was initially hidden
    setTimeout(function () {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [40, 40] });
    }, 100);
  }

  // ==================== PDF Generation ====================
  function generatePDF() {
    try {
      var btn = downloadPdfBtn;
      btn.disabled = true;
      btn.textContent = "Generating PDF...";

      /* global jspdf, html2canvas */
      var doc = new jspdf.jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      var pageWidth = doc.internal.pageSize.getWidth();
      var margin = 15;
      var y = margin;
      var col1X = margin;
      var col2X = margin + 70;
      var lineHeight = 7;

      // Title
      doc.setFontSize(18);
      doc.setTextColor(37, 99, 235);
      doc.text("Trip Cost Report", margin, y);
      y += 8;

      // Date
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Generated: " + new Date().toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric"
      }), margin, y);
      y += 10;

      // Separator
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Trip Details
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("Trip Details", margin, y);
      y += 7;

      doc.setFontSize(9);
      var details = [
        ["From:", state.startGeo.displayName],
        ["To:", state.endGeo.displayName],
        ["Start Date:", formatDate(startDate.value)],
        ["End Date:", formatDate(endDate.value)],
        ["Duration:", state.days + " day" + (state.days !== 1 ? "s" : "")],
        ["Distance:", formatDistance(state.distanceMiles)],
        ["Rate per Mile:", formatCurrency(parseFloat(ratePerMile.value))],
        ["Per Diem Rate:", formatCurrency(state.perDiemRate) + "/day"]
      ];

      for (var i = 0; i < details.length; i++) {
        doc.setFont(undefined, "bold");
        doc.text(details[i][0], col1X, y);
        doc.setFont(undefined, "normal");
        // Wrap long text
        var wrappedText = doc.splitTextToSize(details[i][1], pageWidth - col2X);
        doc.text(wrappedText, col2X, y);
        y += lineHeight * Math.max(1, wrappedText.length);
      }

      y += 4;

      // Cost Breakdown
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("Cost Breakdown", margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      var costItems = [
        ["Mileage Cost:", formatCurrency(state.mileageCost)],
        ["Per Diem Cost:", formatCurrency(state.perDiemCost) + " (" + state.days + " days)"]
      ];

      for (var j = 0; j < costItems.length; j++) {
        doc.setFont(undefined, "normal");
        doc.text(costItems[j][0], col1X, y);
        doc.text(costItems[j][1], col2X, y);
        y += lineHeight + 1;
      }

      y += 2;

      // Total
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 7;

      doc.setFontSize(13);
      doc.setTextColor(37, 99, 235);
      doc.setFont(undefined, "bold");
      doc.text("Total Estimated Cost:", col1X, y);
      doc.text(formatCurrency(state.totalCost), col2X, y);
      y += 10;

      // Capture map
      var mapElement = mapDiv;
      if (mapElement && mapElement.querySelector(".leaflet-container")) {
        return html2canvas(mapElement, {
          useCORS: true,
          scale: 2,
          backgroundColor: "#ffffff"
        }).then(function (canvas) {
          var mapImgData = canvas.toDataURL("image/png");
          var mapImgWidth = pageWidth - margin * 2;
          var mapImgHeight = (canvas.height / canvas.width) * mapImgWidth;

          // Check if map fits on this page
          if (y + mapImgHeight + 25 > doc.internal.pageSize.getHeight()) {
            doc.addPage();
            y = margin;
          }

          doc.setFontSize(10);
          doc.setTextColor(30, 41, 59);
          doc.setFont(undefined, "bold");
          doc.text("Route Map", margin, y);
          y += 6;

          doc.addImage(mapImgData, "PNG", margin, y, mapImgWidth, mapImgHeight);
          y += mapImgHeight + 10;

          addDisclaimer(doc, y);

          doc.save("trip-report.pdf");
          btn.disabled = false;
          btn.textContent = "\uD83D\uDCE5 Download PDF Report";
        });
      } else {
        addDisclaimer(doc, y);
        doc.save("trip-report.pdf");
        btn.disabled = false;
        btn.textContent = "\uD83D\uDCE5 Download PDF Report";
        return Promise.resolve();
      }
    } catch (e) {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "\uD83D\uDCE5 Download PDF Report";
      alert("Failed to generate PDF: " + (e.message || "Unknown error"));
      return Promise.resolve();
    }
  }

  function addDisclaimer(doc, y) {
    var margin = 15;
    var pageWidth = doc.internal.pageSize.getWidth();

    // Check for page break
    if (y + 25 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont(undefined, "italic");
    doc.text("Disclaimer: This report uses GSA FY2025 per diem rates and OpenStreetMap/OSRM routing data.", margin, y);
    y += 4;
    doc.text("All cost estimates are for informational purposes only and may differ from actual expenses.", margin, y);
    y += 4;
    doc.text("Travel Calculator version 1.0", margin, y);
  }

  // ==================== Reset ====================
  function resetAll() {
    // Clean up existing map instance before resetting state
    if (state.mapInstance) {
      state.mapInstance.remove();
      state.mapInstance = null;
    }
    mapDiv.innerHTML = "";

    // Reset state
    state = {
      startGeo: null,
      endGeo: null,
      distanceMeters: 0,
      distanceMiles: 0,
      durationSeconds: 0,
      routeGeometry: null,
      perDiemRate: 0,
      perDiemLocation: null,
      perDiemNote: "",
      mileageCost: 0,
      perDiemCost: 0,
      totalCost: 0,
      days: 0,
      isHaversine: false,
      mapInstance: null,
      routeLayer: null,
      polylineCoords: null
    };

    // Reset form
    form.reset();
    ratePerMile.value = "0.70";
    clearFieldErrors();
    hideGlobalError();

    // Hide results
    resultsSection.classList.add("hidden");

    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ==================== Main Handler ====================
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    hideGlobalError();
    resultsSection.classList.add("hidden");
    showSpinner();

    // Load per diem data first
    loadPerDiemData()
      .then(function () {
        // Step 1: Geocode start address
        return geocodeAddress(startAddress.value.trim());
      })
      .then(function (startGeo) {
        state.startGeo = startGeo;
        // Step 2: Wait 1100ms to respect Nominatim rate limit
        return delay(1100).then(function () {
          return geocodeAddress(endAddress.value.trim());
        });
      })
      .then(function (endGeo) {
        state.endGeo = endGeo;
        // Step 3: Get OSRM route
        return getOSRMRoute(
          state.startGeo.lon, state.startGeo.lat,
          state.endGeo.lon, state.endGeo.lat
        ).catch(function (osrmErr) {
          // OSRM failed, fallback to Haversine
          console.warn("OSRM failed, using Haversine fallback:", osrmErr.message);
          state.isHaversine = true;
          var dist = haversineDistance(
            state.startGeo.lat, state.startGeo.lon,
            state.endGeo.lat, state.endGeo.lon
          );
          return {
            distanceMeters: dist,
            durationSeconds: dist / 13.41, // rough estimate: ~30 mph average
            geometry: null
          };
        });
      })
      .then(function (routeData) {
        state.distanceMeters = routeData.distanceMeters;
        state.durationSeconds = routeData.durationSeconds;

        // Decode polyline if available
        if (routeData.geometry) {
          state.routeGeometry = routeData.geometry;
          state.polylineCoords = decodePolyline(routeData.geometry);
        } else {
          state.polylineCoords = null;
        }

        // Step 4: Lookup per diem for destination
        var pd = lookupPerDiem(state.endGeo, startDate.value, endDate.value);
        if (pd) {
          state.perDiemRate = pd.dailyRate;
          state.perDiemLocation = pd;
        } else {
          // Ultimate fallback
          state.perDiemRate = 178;
          state.perDiemLocation = {
            lodging: 110,
            meals: 68,
            dailyRate: 178,
            locationName: "Standard CONUS Rate",
            isStandard: true
          };
        }

        // Step 5: Calculate costs
        calculateCosts();

        // Step 6: Display results
        displayResults();
        hideSpinner();
      })
      .catch(function (err) {
        hideSpinner();
        console.error("Calculation error:", err);
        showGlobalError("Error: " + (err.message || "An unexpected error occurred. Please try again."));
      });
  });

  // Download PDF
  downloadPdfBtn.addEventListener("click", function () {
    generatePDF().catch(function (err) {
      console.error("PDF generation error:", err);
      alert("Failed to generate PDF. Please try again.");
    });
  });

  // New calculation
  newCalcBtn.addEventListener("click", function () {
    resetAll();
  });

  // ==================== Initialize ====================
  // Preload per-diem data
  loadPerDiemData().catch(function () {
    console.warn("Could not preload per-diem.json. It will be loaded on first calculation.");
  });

})();
