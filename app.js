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
  const emailResultsBtn = $("emailResultsBtn");
  const emailForm = $("emailForm");
  const emailToAddr = $("emailToAddr");
  const sendEmailBtn = $("sendEmailBtn");
  const cancelEmailBtn = $("cancelEmailBtn");
  const emailStatus = $("emailStatus");
  const newCalcBtn = $("newCalcBtn");

  const startZip = $("startZip");
  const endZip = $("endZip");
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
    perDiemLodging: 0,
    perDiemMeals: 0,
    perDiemLocation: null,
    perDiemNote: "",
    mileageCost: 0,
    lodgingCost: 0,
    mealsCost: 0,
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
    if (input && (input.tagName === "INPUT" || input.tagName === "SELECT")) {
      input.classList.add("input-error");
    }
    el.textContent = msg;
    el.classList.add("visible");
  }

  function highlightError(inputEl, errorEl, msg) {
    if (inputEl) { inputEl.classList.add("input-error"); }
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.add("visible");
    }
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

  function buildFullAddress(prefix) {
    var zip = $(prefix + "Zip").value.trim();
    return zip;
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

    // Starting location: Zip code required (5 digits)
    var startZ = startZip.value.trim();
    if (!startZ || !/^\d{5}/.test(startZ)) {
      highlightError(startZip, $("startAddrError"), "Enter a valid 5-digit zip code.");
      valid = false;
    }

    // Destination location: Zip code required (5 digits)
    var endZ = endZip.value.trim();
    if (!endZ || !/^\d{5}/.test(endZ)) {
      highlightError(endZip, $("endAddrError"), "Enter a valid 5-digit zip code.");
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
    // Detect if input is a US zip code (5 digits, possibly followed by ", USA")
    var zipMatch = address.match(/^(\d{5})/);
    var url;
    if (zipMatch) {
      // Use structured postal code search — far more accurate than free-text
      url = "https://nominatim.openstreetmap.org/search?format=json"
        + "&postalcode=" + zipMatch[1]
        + "&country=us"
        + "&limit=1&addressdetails=1";
    } else {
      // Free-text fallback for non-zip addresses
      url = "https://nominatim.openstreetmap.org/search?format=json&q="
        + encodeURIComponent(address)
        + "&limit=1&addressdetails=1&countrycodes=us";
    }

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

  function lookupPerDiemByZip(zipCode, tripStartDate, tripEndDate) {
    if (!perDiemData) { return null; }
    if (!zipCode || zipCode.length < 3) { return getStandardRate(); }

    var data = perDiemData;
    var destId = null;

    // Try 3-digit prefix first (most efficient)
    var prefix = zipCode.substring(0, 3);
    if (data.zipPrefixLookup && data.zipPrefixLookup[prefix]) {
      destId = data.zipPrefixLookup[prefix];
    }
    // Try full 5-digit zip
    if (!destId && data.zipLookup && data.zipLookup[zipCode]) {
      destId = data.zipLookup[zipCode];
    }

    if (!destId || !data.destinations[destId]) {
      return getStandardRate(zipCode);
    }

    var dest = data.destinations[destId];
    var monthlyRates = dest.rates; // [Oct, Nov, Dec, Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep]
    var mealsRate = dest.meals;

    // Calculate lodging cost day-by-day using monthly rates
    // Fiscal year months: 0=Oct, 1=Nov, 2=Dec, 3=Jan, 4=Feb, 5=Mar, 6=Apr, 7=May, 8=Jun, 9=Jul, 10=Aug, 11=Sep
    var sParts = tripStartDate.split("-");
    var eParts = tripEndDate.split("-");
    var d = new Date(Date.UTC(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10)));
    var end = new Date(Date.UTC(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10)));

    var totalLodging = 0;
    var dayCount = 0;
    var ratesUsed = {}; // Track which monthly rates were applied

    while (d <= end) {
      // Convert calendar month (0-11) to fiscal year month index (0=Oct...11=Sep)
      var calMonth = d.getUTCMonth(); // 0=Jan...11=Dec
      var fyIndex = (calMonth + 3) % 12; // Jan(0)→3, Feb(1)→4, ..., Oct(9)→0, Nov(10)→1, Dec(11)→2
      var rate = monthlyRates[fyIndex] || data.standardLodging || 110;
      totalLodging += rate;
      ratesUsed[rate] = true;
      dayCount++;
      d.setUTCDate(d.getUTCDate() + 1);
    }

    // Average lodging rate for display
    var avgLodging = Math.round(totalLodging / dayCount);

    // If multiple rates were used, note it
    var rateNote = "";
    var uniqueRates = Object.keys(ratesUsed);
    if (uniqueRates.length > 1) {
      rateNote = " (varies by month)";
    }

    return {
      lodging: avgLodging,
      meals: mealsRate,
      dailyRate: avgLodging + mealsRate,
      totalLodging: totalLodging,
      totalMeals: mealsRate * dayCount,
      totalPerDiem: totalLodging + (mealsRate * dayCount),
      locationName: dest.name + ", " + (dest.state || ""),
      isStandard: false,
      rateNote: rateNote
    };
  }

  function getStandardRate(zipCode) {
    var stdLodging = perDiemData ? (perDiemData.standardLodging || 110) : 110;
    var stdMeals = perDiemData ? (perDiemData.standardMeals || 68) : 68;
    var note = zipCode ? " (no match for ZIP " + zipCode + ")" : "";
    return {
      lodging: stdLodging,
      meals: stdMeals,
      dailyRate: stdLodging + stdMeals,
      locationName: "Standard CONUS Rate" + note,
      isStandard: true
    };
  }

  // ==================== Calculation ====================
  function calculateCosts() {
    state.distanceMiles = state.distanceMeters / 1609.344;
    var rate = parseFloat(ratePerMile.value);

    // Parse dates as UTC
    var sParts = startDate.value.split("-");
    var eParts = endDate.value.split("-");
    var sd = new Date(Date.UTC(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10)));
    var ed = new Date(Date.UTC(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10)));
    state.days = Math.max(1, Math.round((ed - sd) / 86400000) + 1);

    state.mileageCost = state.distanceMiles * rate;

    // If per-diem totals were pre-calculated (zip-based lookup), use them
    // Otherwise fall back to simple day × rate multiplication
    if (!state.perDiemCost) {
      state.lodgingCost = state.perDiemLodging * state.days;
      state.mealsCost = state.perDiemMeals * state.days;
      state.perDiemCost = state.lodgingCost + state.mealsCost;
    }
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
      { label: "Mileage Cost", value: formatCurrency(state.mileageCost) },
      { label: "Lodging Rate", value: formatCurrency(state.perDiemLodging) + "/day" },
      { label: "Meals Rate", value: formatCurrency(state.perDiemMeals) + "/day" }
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
      + "<span class=\"cost-label\">Lodging Cost (" + state.days + " day" + (state.days !== 1 ? "s" : "")
      + " \u00D7 " + formatCurrency(state.perDiemLodging) + ")</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.lodgingCost) + "</span>"
      + "</div>"
      + "<div class=\"cost-row\">"
      + "<span class=\"cost-label\">Meals Cost (" + state.days + " day" + (state.days !== 1 ? "s" : "")
      + " \u00D7 " + formatCurrency(state.perDiemMeals) + ")</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.mealsCost) + "</span>"
      + "</div>"
      + "<div class=\"cost-row cost-subtotal\">"
      + "<span class=\"cost-label\">Total Per Diem</span>"
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
  // onComplete(blob): optional callback — if provided, PDF is returned as blob
  // instead of being saved to disk. Used by email handler for attachments.
  function generatePDF(onComplete) {
    try {
      var btn = downloadPdfBtn;
      btn.disabled = true;
      btn.textContent = "Generating PDF...";

      /* global jspdf */
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
        ["Mileage Cost:", formatCurrency(state.mileageCost)],
        ["Lodging Rate:", formatCurrency(state.perDiemLodging) + "/day"],
        ["Meals Rate:", formatCurrency(state.perDiemMeals) + "/day"]
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
        ["Lodging Cost:", formatCurrency(state.lodgingCost) + " (" + state.days + " days \u00D7 " + formatCurrency(state.perDiemLodging) + ")"],
        ["Meals Cost:", formatCurrency(state.mealsCost) + " (" + state.days + " days \u00D7 " + formatCurrency(state.perDiemMeals) + ")"]
      ];

      for (var j = 0; j < costItems.length; j++) {
        doc.setFont(undefined, "normal");
        doc.text(costItems[j][0], col1X, y);
        doc.text(costItems[j][1], col2X, y);
        y += lineHeight + 1;
      }

      // Per Diem subtotal
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(margin, y - 2, pageWidth - margin, y - 2);
      doc.setFont(undefined, "bold");
      doc.text("Total Per Diem:", col1X, y);
      doc.text(formatCurrency(state.perDiemCost), col2X, y);
      y += lineHeight + 3;

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

      // Static map image (reliable, no CORS issues)
      var zoom = calcStaticMapZoom(state.distanceMiles);
      var centerLat = (state.startGeo.lat + state.endGeo.lat) / 2;
      var centerLon = (state.startGeo.lon + state.endGeo.lon) / 2;
      var mapUrl = "https://staticmap.openstreetmap.de/staticmap.php"
        + "?center=" + centerLat.toFixed(5) + "," + centerLon.toFixed(5)
        + "&zoom=" + zoom
        + "&size=800x400"
        + "&markers=" + state.startGeo.lat.toFixed(5) + "," + state.startGeo.lon.toFixed(5) + ",ol-marker"
        + "|" + state.endGeo.lat.toFixed(5) + "," + state.endGeo.lon.toFixed(5) + ",ol-marker";

      var mapImg = new Image();
      mapImg.crossOrigin = "anonymous";
      mapImg.onload = function () {
        var mapImgWidth = pageWidth - margin * 2;
        var mapImgHeight = (mapImg.naturalHeight / mapImg.naturalWidth) * mapImgWidth;

        if (y + mapImgHeight + 25 > doc.internal.pageSize.getHeight()) {
          doc.addPage();
          y = margin;
        }

        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.setFont(undefined, "bold");
        doc.text("Route Map", margin, y);
        y += 6;

        doc.addImage(mapImg, "PNG", margin, y, mapImgWidth, mapImgHeight);
        y += mapImgHeight + 10;

        addDisclaimer(doc, y);
        if (onComplete) {
          onComplete(doc.output("blob"));
        } else {
          doc.save("trip-report.pdf");
        }
        btn.disabled = false;
        btn.textContent = "\uD83D\uDCE5 Download PDF Report";
      };
      mapImg.onerror = function () {
        doc.setFontSize(9);
        doc.setTextColor(200, 50, 50);
        doc.text("(Map image could not be loaded from the server.)", margin, y + 6);
        y += 14;
        addDisclaimer(doc, y);
        if (onComplete) {
          onComplete(doc.output("blob"));
        } else {
          doc.save("trip-report.pdf");
        }
        btn.disabled = false;
        btn.textContent = "\uD83D\uDCE5 Download PDF Report";
      };
      mapImg.src = mapUrl;
      return; // Async — image onload handles PDF finalization
    } catch (e) {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "\uD83D\uDCE5 Download PDF Report";
      alert("Failed to generate PDF: " + (e.message || "Unknown error"));
      return Promise.resolve();
    }
  }

  function calcStaticMapZoom(distanceMiles) {
    // Approximate zoom based on distance to fit both markers
    if (distanceMiles < 1) { return 14; }
    if (distanceMiles < 5) { return 12; }
    if (distanceMiles < 20) { return 10; }
    if (distanceMiles < 75) { return 8; }
    if (distanceMiles < 250) { return 6; }
    if (distanceMiles < 800) { return 5; }
    if (distanceMiles < 2000) { return 4; }
    return 3;
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
    doc.text("Disclaimer: This report uses GSA FY2026 per diem rates and OpenStreetMap/OSRM routing data.", margin, y);
    y += 4;
    doc.text("All cost estimates are for informational purposes only and may differ from actual expenses.", margin, y);
    y += 4;
    doc.text("Travel Allowance Calculator v1.0", margin, y);
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
      perDiemLodging: 0,
      perDiemMeals: 0,
      perDiemLocation: null,
      perDiemNote: "",
      mileageCost: 0,
      lodgingCost: 0,
      mealsCost: 0,
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
    ratePerMile.value = "0.725";
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
        return geocodeAddress(buildFullAddress("start"));
      })
      .then(function (startGeo) {
        state.startGeo = startGeo;
        // Step 2: Wait 1100ms to respect Nominatim rate limit
        return delay(1100).then(function () {
          return geocodeAddress(buildFullAddress("end"));
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

        // Step 4: Lookup per diem by destination zip code
        var destZip = endZip.value.trim();
        var pd = lookupPerDiemByZip(destZip, startDate.value, endDate.value);
        if (pd) {
          state.perDiemRate = pd.dailyRate;
          state.perDiemLodging = pd.lodging;
          state.perDiemMeals = pd.meals;
          state.perDiemLocation = pd;
          // If the lookup returned pre-calculated totals, use them
          if (pd.totalLodging !== undefined) {
            state.lodgingCost = pd.totalLodging;
            state.mealsCost = pd.totalMeals;
            state.perDiemCost = pd.totalPerDiem;
          }
        } else {
          // Ultimate fallback
          state.perDiemRate = 178;
          state.perDiemLodging = 110;
          state.perDiemMeals = 68;
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
    generatePDF();
  });

  // Email Results — show/hide form
  emailResultsBtn.addEventListener("click", function () {
    var isHidden = emailForm.classList.contains("hidden");
    if (isHidden) {
      emailForm.classList.remove("hidden");
      emailStatus.textContent = "";
      emailStatus.className = "email-status";
      emailToAddr.focus();
    } else {
      emailForm.classList.add("hidden");
    }
  });

  cancelEmailBtn.addEventListener("click", function () {
    emailForm.classList.add("hidden");
    emailStatus.textContent = "";
    emailStatus.className = "email-status";
  });

  // Send email — generates PDF and sends as attachment via EmailJS
  // ================================================================
  // EMAILJS SETUP GUIDE (free, 2 minutes):
  //   1. Go to https://www.emailjs.com and click "Sign Up Free"
  //   2. After login, go to "Email Services" → "Add New Service"
  //      Choose Gmail/Outlook/etc. Click "Connect Account" → copy the Service ID
  //   3. Go to "Email Templates" → "Create New Template"
  //      Paste these variables into your template:
  //        To: {{to_email}}
  //        Subject: {{subject}}
  //        Message: {{message}}
  //        Attach a file field: {{file}}  (use the paperclip icon)
  //      Save → copy the Template ID
  //   4. Go to "Account" → "API Keys" → copy your Public Key
  //   5. Replace the 3 values below with your keys
  // ================================================================
  var EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";
  var EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
  var EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";

  sendEmailBtn.addEventListener("click", function () {
    var toAddr = emailToAddr.value.trim();
    if (!toAddr || toAddr.indexOf("@") === -1) {
      emailStatus.textContent = "Please enter a valid email address.";
      emailStatus.className = "email-status error";
      return;
    }

    sendEmailBtn.disabled = true;
    sendEmailBtn.textContent = "Generating PDF...";
    emailStatus.textContent = "";
    emailStatus.className = "email-status";

    // Build text body
    var bodyLines = [
      "TRIP COST REPORT",
      "",
      "From: " + state.startGeo.displayName,
      "To: " + state.endGeo.displayName,
      "Dates: " + formatDate(startDate.value) + " to " + formatDate(endDate.value),
      "Duration: " + state.days + " day" + (state.days !== 1 ? "s" : ""),
      "Distance: " + formatDistance(state.distanceMiles),
      "Rate per Mile: " + formatCurrency(parseFloat(ratePerMile.value)),
      "Lodging Rate: " + formatCurrency(state.perDiemLodging) + "/day" + (state.perDiemLocation && state.perDiemLocation.rateNote ? state.perDiemLocation.rateNote : ""),
      "Meals Rate: " + formatCurrency(state.perDiemMeals) + "/day",
      "Location: " + (state.perDiemLocation ? state.perDiemLocation.locationName : "Standard CONUS Rate"),
      "",
      "--- COST BREAKDOWN ---",
      "Mileage Cost: " + formatCurrency(state.mileageCost),
      "Lodging Cost: " + formatCurrency(state.lodgingCost) + " (" + state.days + " days)",
      "Meals Cost: " + formatCurrency(state.mealsCost) + " (" + state.days + " days)",
      "Total Per Diem: " + formatCurrency(state.perDiemCost),
      "TOTAL ESTIMATED COST: " + formatCurrency(state.totalCost),
      "",
      "---",
      "Generated by Travel Allowance Calculator",
      "GSA FY2026 per diem rates. For estimation purposes only."
    ];

    var subject = "Trip Cost Report - " + startZip.value.trim() + " to " + endZip.value.trim();

    // Generate PDF blob, then send via EmailJS
    generatePDF(function (pdfBlob) {
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result.split(",")[1]; // Strip data:... prefix

        var templateParams = {
          to_email: toAddr,
          subject: subject,
          message: bodyLines.join("\n"),
          file: base64,
          filename: "trip-report.pdf"
        };

        emailjs.init(EMAILJS_PUBLIC_KEY);
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
          .then(function () {
            emailStatus.textContent = "Report sent to " + toAddr + "!";
            emailStatus.className = "email-status success";
            sendEmailBtn.disabled = false;
            sendEmailBtn.textContent = "Send";
            emailToAddr.value = "";
          })
          .catch(function (err) {
            emailStatus.textContent = "Failed: " + (err.text || err.message || "Check EmailJS setup.");
            emailStatus.className = "email-status error";
            sendEmailBtn.disabled = false;
            sendEmailBtn.textContent = "Send";
          });
      };
      reader.readAsDataURL(pdfBlob);
    });

    // Reset button text — generatePDF handles its own button state
    sendEmailBtn.textContent = "Sending...";
  });

  // New calculation
  newCalcBtn.addEventListener("click", function () {
    resetAll();
  });

  // ==================== Initialize ====================
  // Set minimum date to today to prevent past date selection
  var today = new Date().toISOString().split("T")[0];
  startDate.setAttribute("min", today);
  endDate.setAttribute("min", today);

  // Preload per-diem data
  loadPerDiemData().catch(function () {
    console.warn("Could not preload per-diem.json. It will be loaded on first calculation.");
  });

})();
