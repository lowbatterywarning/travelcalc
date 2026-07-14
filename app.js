(function () {
  "use strict";

  // ==================== DOM References ====================
  var $ = function (id) { return document.getElementById(id); };

  var form = $("tripForm");
  var legsContainer = $("legsContainer");
  var addLegBtn = $("addLegBtn");
  var ratePerMile = $("ratePerMile");
  var legsError = $("legsError");
  var destZip = $("destZip");
  var startDate = $("startDate");
  var endDate = $("endDate");
  var calculateBtn = $("calculateBtn");
  var btnText = calculateBtn ? calculateBtn.querySelector(".btn-text") : null;
  var btnSpinner = $("btnSpinner");
  var globalError = $("globalError");
  var resultsSection = $("resultsSection");
  var summaryGrid = $("summaryGrid");
  var disclaimerNotes = $("disclaimerNotes");
  var costTable = $("costTable");
  var mapDiv = $("map");
  var downloadPdfBtn = $("downloadPdfBtn");
  var emailResultsBtn = $("emailResultsBtn");
  var emailForm = $("emailForm");
  var emailToAddr = $("emailToAddr");
  var sendEmailBtn = $("sendEmailBtn");
  var cancelEmailBtn = $("cancelEmailBtn");
  var emailStatus = $("emailStatus");
  var newCalcBtn = $("newCalcBtn");
  var legTemplate = document.getElementById("legTemplate");

  // ==================== State ====================
  var state = {
    legs: [],
    legIdCounter: 0,
    destZipGeo: null,
    perDiemRate: 0,
    perDiemLodging: 0,
    perDiemMeals: 0,
    perDiemLocation: null,
    lodgingCost: 0,
    mealsCost: 0,
    perDiemCost: 0,
    transportationTotal: 0,
    totalCost: 0,
    days: 0,
    isHaversine: false,
    haversineNote: "",
    mapInstance: null
  };

  // ==================== Leg Management ====================
  function createLeg(type, data) {
    type = type || "personal_car";
    state.legIdCounter++;
    var id = state.legIdCounter;

    var clone = legTemplate.content.cloneNode(true);
    var card = clone.querySelector(".leg-card");
    card.setAttribute("data-leg-id", id);

    var typeSelect = card.querySelector(".leg-type-select");
    typeSelect.value = type;
    card.querySelector(".leg-number").textContent = "Leg " + (state.legs.length + 1);

    // Show correct fields for type
    updateLegFields(card, type);

    // Pre-fill data if provided
    if (data) {
      fillLegData(card, type, data);
    }

    // Type change handler
    typeSelect.addEventListener("change", function () {
      var newType = typeSelect.value;
      updateLegFields(card, newType);
      syncDestZipFromLeg();
    });

    // Remove handler
    card.querySelector(".btn-remove-leg").addEventListener("click", function () {
      removeLeg(id);
    });

    // Receipt handler
    var receiptFile = card.querySelector(".leg-receipt-file");
    var receiptName = card.querySelector(".receipt-name");
    var removeReceiptBtn = card.querySelector(".btn-remove-receipt");
    receiptFile.addEventListener("change", function () {
      var file = receiptFile.files[0];
      if (file) {
        receiptName.textContent = file.name;
        removeReceiptBtn.classList.remove("hidden");
        var reader = new FileReader();
        reader.onload = function (e) {
          card.setAttribute("data-receipt-data", e.target.result);
          card.setAttribute("data-receipt-name", file.name);
        };
        reader.readAsDataURL(file);
      }
    });
    removeReceiptBtn.addEventListener("click", function () {
      receiptFile.value = "";
      receiptName.textContent = "";
      removeReceiptBtn.classList.add("hidden");
      card.removeAttribute("data-receipt-data");
      card.removeAttribute("data-receipt-name");
    });

    // Drag-and-drop
    card.addEventListener("dragstart", onDragStart);
    card.addEventListener("dragover", onDragOver);
    card.addEventListener("dragleave", onDragLeave);
    card.addEventListener("drop", onDrop);
    card.addEventListener("dragend", onDragEnd);

    legsContainer.appendChild(card);
    updateAllLegNumbers();
    syncDestZipFromLeg();
    return id;
  }

  function updateLegFields(card, type) {
    var allFields = card.querySelectorAll(".leg-fields");
    for (var i = 0; i < allFields.length; i++) {
      allFields[i].classList.add("hidden");
    }
    var fields = card.querySelector(".leg-fields-" + type);
    if (fields) { fields.classList.remove("hidden"); }
  }

  function fillLegData(card, type, data) {
    if (type === "personal_car" || type === "rental_car") {
      setVal(card, ".leg-from-zip", data.fromZip);
      setVal(card, ".leg-to-zip", data.toZip);
    }
    if (type === "rental_car") {
      setVal(card, ".leg-daily-rate", data.dailyRate);
      setVal(card, ".leg-rental-days", data.rentalDays);
    }
    if (type === "flight") {
      setVal(card, ".leg-dep-city", data.depCity);
      setVal(card, ".leg-arr-city", data.arrCity);
      setVal(card, ".leg-airline", data.airline);
      setVal(card, ".leg-cost", data.cost);
    }
    if (type === "taxi") {
      setVal(card, ".leg-from", data.from);
      setVal(card, ".leg-to", data.to);
      setVal(card, ".leg-cost", data.cost);
    }
  }

  function setVal(card, selector, val) {
    if (val !== undefined && val !== null) {
      var el = card.querySelector(selector);
      if (el) { el.value = val; }
    }
  }

  function removeLeg(id) {
    var card = legsContainer.querySelector('[data-leg-id="' + id + '"]');
    if (card) { card.remove(); }
    updateAllLegNumbers();
    syncDestZipFromLeg();
  }

  function updateAllLegNumbers() {
    var cards = legsContainer.querySelectorAll(".leg-card");
    for (var i = 0; i < cards.length; i++) {
      cards[i].querySelector(".leg-number").textContent = "Leg " + (i + 1);
    }
  }

  function syncDestZipFromLeg() {
    var cards = legsContainer.querySelectorAll(".leg-card");
    if (cards.length !== 1) { return; }
    var type = cards[0].querySelector(".leg-type-select").value;
    if (type !== "personal_car" && type !== "rental_car") { return; }
    var toZipEl = cards[0].querySelector(".leg-to-zip");
    if (toZipEl && toZipEl.value.trim()) {
      destZip.value = toZipEl.value.trim();
    }
  }

  function collectLegData() {
    var legs = [];
    var cards = legsContainer.querySelectorAll(".leg-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var type = card.querySelector(".leg-type-select").value;
      var leg = { type: type, el: card };

      if (type === "personal_car" || type === "rental_car") {
        leg.fromZip = val(card, ".leg-from-zip");
        leg.toZip = val(card, ".leg-to-zip");
      }
      if (type === "rental_car") {
        leg.dailyRate = parseFloat(val(card, ".leg-daily-rate")) || 0;
        leg.rentalDays = parseInt(val(card, ".leg-rental-days")) || 1;
      }
      if (type === "flight") {
        leg.depCity = val(card, ".leg-dep-city");
        leg.arrCity = val(card, ".leg-arr-city");
        leg.airline = val(card, ".leg-airline");
        leg.cost = parseFloat(val(card, ".leg-cost")) || 0;
      }
      if (type === "taxi") {
        leg.from = val(card, ".leg-from");
        leg.to = val(card, ".leg-to");
        leg.cost = parseFloat(val(card, ".leg-cost")) || 0;
      }

      // Receipt
      leg.receiptName = card.getAttribute("data-receipt-name") || "";
      leg.receiptData = card.getAttribute("data-receipt-data") || "";

      legs.push(leg);
    }
    return legs;
  }

  function val(card, selector) {
    var el = card.querySelector(selector);
    return el ? el.value.trim() : "";
  }

  // ==================== Drag-and-Drop ====================
  var draggedCard = null;

  function onDragStart(e) {
    draggedCard = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (this !== draggedCard) {
      this.classList.add("drag-over");
    }
  }

  function onDragLeave() {
    this.classList.remove("drag-over");
  }

  function onDrop(e) {
    e.preventDefault();
    this.classList.remove("drag-over");
    if (this !== draggedCard && draggedCard) {
      var cards = Array.from(legsContainer.querySelectorAll(".leg-card"));
      var fromIdx = cards.indexOf(draggedCard);
      var toIdx = cards.indexOf(this);
      if (fromIdx < toIdx) {
        this.parentNode.insertBefore(draggedCard, this.nextSibling);
      } else {
        this.parentNode.insertBefore(draggedCard, this);
      }
      updateAllLegNumbers();
    }
  }

  function onDragEnd() {
    this.classList.remove("dragging");
    var allCards = legsContainer.querySelectorAll(".leg-card");
    for (var i = 0; i < allCards.length; i++) {
      allCards[i].classList.remove("drag-over");
    }
    draggedCard = null;
  }

  // ==================== Helpers ====================
  function showSpinner() {
    if (btnText) { btnText.classList.add("hidden"); }
    btnSpinner.classList.remove("hidden");
    calculateBtn.disabled = true;
  }

  function hideSpinner() {
    if (btnText) { btnText.classList.remove("hidden"); }
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

  function formatCurrency(v) {
    if (typeof v !== "number" || isNaN(v)) { return "$0.00"; }
    return "$" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatDistance(miles) {
    if (typeof miles !== "number" || isNaN(miles)) { return "0.0 mi"; }
    return miles.toFixed(1) + " mi";
  }

  function formatDate(dateStr) {
    if (!dateStr) { return ""; }
    var parts = dateStr.split("-");
    var d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }

  var escapeHtml = (function () {
    var escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    var re = /[&<>"']/g;
    return function (str) {
      if (!str) { return ""; }
      return String(str).replace(re, function (ch) { return escapeMap[ch]; });
    };
  })();

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ==================== Form Validation ====================
  function validateForm() {
    hideGlobalError();
    clearFieldErrors();

    var rateVal = parseFloat(ratePerMile.value);
    if (isNaN(rateVal) || rateVal <= 0) {
      legsError.textContent = "Enter a valid mileage rate greater than $0.";
      legsError.classList.add("visible");
      return false;
    }

    var cards = legsContainer.querySelectorAll(".leg-card");
    if (cards.length === 0) {
      legsError.textContent = "Add at least one transportation leg.";
      legsError.classList.add("visible");
      return false;
    }
    legsError.textContent = "";
    legsError.classList.remove("visible");

    // Validate each leg
    var legs = collectLegData();
    for (var i = 0; i < legs.length; i++) {
      var leg = legs[i];
      if (leg.type === "personal_car" || leg.type === "rental_car") {
        if (!leg.fromZip || !/^\d{5}/.test(leg.fromZip) || !leg.toZip || !/^\d{5}/.test(leg.toZip)) {
          legsError.textContent = "All car legs need valid 5-digit From Zip and To Zip.";
          legsError.classList.add("visible");
          return false;
        }
      }
      if (leg.type === "rental_car") {
        if (!leg.dailyRate || leg.dailyRate <= 0) {
          legsError.textContent = "Rental car legs need a daily rate greater than $0.";
          legsError.classList.add("visible");
          return false;
        }
        if (!leg.rentalDays || leg.rentalDays < 1) {
          legsError.textContent = "Rental car legs need at least 1 rental day.";
          legsError.classList.add("visible");
          return false;
        }
      }
      if (leg.type === "flight" && (!leg.depCity || !leg.arrCity || !leg.cost)) {
        legsError.textContent = "Flight legs need departure city, arrival city, and cost.";
        legsError.classList.add("visible");
        return false;
      }
      if (leg.type === "taxi" && (!leg.from || !leg.to || !leg.cost)) {
        legsError.textContent = "Taxi legs need From, To, and Cost.";
        legsError.classList.add("visible");
        return false;
      }
    }

    if (!destZip.value.trim() || !/^\d{5}/.test(destZip.value.trim())) {
      showFieldError("destZipError", "Enter a valid 5-digit destination zip code.");
      return false;
    }
    if (!startDate.value) {
      showFieldError("startDateError", "Select a start date.");
      return false;
    }
    if (!endDate.value) {
      showFieldError("endDateError", "Select an end date.");
      return false;
    }
    if (startDate.value && endDate.value) {
      var sdP = startDate.value.split("-");
      var edP = endDate.value.split("-");
      var sd = new Date(Date.UTC(parseInt(sdP[0], 10), parseInt(sdP[1], 10) - 1, parseInt(sdP[2], 10)));
      var ed = new Date(Date.UTC(parseInt(edP[0], 10), parseInt(edP[1], 10) - 1, parseInt(edP[2], 10)));
      if (ed < sd) {
        showFieldError("endDateError", "End date must be on or after start date.");
        return false;
      }
    }
    return true;
  }

  function showFieldError(id, msg) {
    var el = $(id);
    el.textContent = msg;
    el.classList.add("visible");
  }

  function clearFieldErrors() {
    var errors = document.querySelectorAll(".error-msg");
    for (var i = 0; i < errors.length; i++) {
      errors[i].textContent = "";
      errors[i].classList.remove("visible");
    }
  }

  // ==================== Geocoding ====================
  function geocodeZip(zip) {
    var match = zip.match(/^(\d{5})/);
    if (!match) { return Promise.reject(new Error("Invalid zip code: " + zip)); }
    var url = "https://nominatim.openstreetmap.org/search?format=json"
      + "&postalcode=" + match[1]
      + "&country=us&limit=1&addressdetails=1";

    return fetch(url, {
      headers: { "User-Agent": "TravelAllowanceCalc/1.0" }
    })
      .then(function (res) {
        if (!res.ok) { throw new Error("Nominatim error: " + res.status); }
        return res.json();
      })
      .then(function (data) {
        if (!data || data.length === 0) { throw new Error("Zip not found: " + zip); }
        var r = data[0];
        var addr = r.address || {};
        return {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          displayName: r.display_name,
          city: addr.city || addr.town || addr.village || "",
          county: addr.county || "",
          state: addr.state || ""
        };
      });
  }

  // ==================== OSRM Distance ====================
  function getOSRMRoute(lon1, lat1, lon2, lat2) {
    var url = "https://router.project-osrm.org/route/v1/driving/"
      + lon1 + "," + lat1 + ";" + lon2 + "," + lat2
      + "?overview=full&geometries=polyline";
    return fetch(url)
      .then(function (res) {
        if (!res.ok) { throw new Error("OSRM error: " + res.status); }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.routes || data.routes.length === 0) {
          throw new Error("No route found.");
        }
        return { distanceMeters: data.routes[0].distance, geometry: data.routes[0].geometry };
      });
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function decodePolyline(str) {
    var idx = 0, lat = 0, lng = 0, coords = [];
    while (idx < str.length) {
      var shift = 0, result = 0, byte;
      do { byte = str.charCodeAt(idx++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { byte = str.charCodeAt(idx++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coords.push([lat * 1e-5, lng * 1e-5]);
    }
    return coords;
  }

  // ==================== Per Diem Lookup ====================
  var perDiemData = null;

  function loadPerDiemData() {
    if (perDiemData) { return Promise.resolve(perDiemData); }
    return fetch("per-diem.json")
      .then(function (res) { return res.json(); })
      .then(function (data) { perDiemData = data; return data; });
  }

  function lookupPerDiemByZip(zip, start, end) {
    if (!perDiemData) { return null; }
    if (!zip || zip.length < 3) { return getStandardRate(); }

    var data = perDiemData;
    var destId = null;
    var prefix = zip.substring(0, 3);
    if (data.zipPrefixLookup && data.zipPrefixLookup[prefix]) {
      destId = data.zipPrefixLookup[prefix];
    }
    if (!destId && data.zipLookup && data.zipLookup[zip]) {
      destId = data.zipLookup[zip];
    }
    if (!destId || !data.destinations[destId]) {
      return getStandardRate(zip);
    }

    var dest = data.destinations[destId];
    var monthlyRates = dest.rates;
    var mealsRate = dest.meals;

    var sP = start.split("-"), eP = end.split("-");
    var d = new Date(Date.UTC(parseInt(sP[0], 10), parseInt(sP[1], 10) - 1, parseInt(sP[2], 10)));
    var ed = new Date(Date.UTC(parseInt(eP[0], 10), parseInt(eP[1], 10) - 1, parseInt(eP[2], 10)));

    // Guard: if any day falls beyond the data's fiscal year (ends Sep 30 of fyYear),
    // fall back to standard rates for the entire trip
    var fyEndYear = data.fiscalYear || 2026;
    var fyEnd = new Date(Date.UTC(fyEndYear, 9, 1)); // Oct 1 = start of next FY
    if (ed >= fyEnd) {
      return getStandardRate(zip);
    }

    var totalLodging = 0, dayCount = 0, ratesUsed = {};
    while (d <= ed) {
      var calMonth = d.getUTCMonth();
      var fyIndex = (calMonth + 3) % 12;
      var rate = monthlyRates[fyIndex] || data.standardLodging || 110;
      totalLodging += rate;
      ratesUsed[rate] = true;
      dayCount++;
      d.setUTCDate(d.getUTCDate() + 1);
    }

    var avgLodging = Math.round(totalLodging / dayCount);
    var rateNote = Object.keys(ratesUsed).length > 1 ? " (varies by month)" : "";
    var totalMeals = mealsRate * dayCount;

    return {
      lodging: avgLodging,
      meals: mealsRate,
      dailyRate: avgLodging + mealsRate,
      totalLodging: totalLodging,
      totalMeals: totalMeals,
      totalPerDiem: totalLodging + totalMeals,
      locationName: dest.name + ", " + (dest.state || ""),
      isStandard: false,
      rateNote: rateNote
    };
  }

  function getStandardRate(zip) {
    var sl = perDiemData ? (perDiemData.standardLodging || 110) : 110;
    var sm = perDiemData ? (perDiemData.standardMeals || 68) : 68;
    return {
      lodging: sl, meals: sm, dailyRate: sl + sm,
      locationName: "Standard CONUS Rate" + (zip ? " (no match for " + zip + ")" : ""),
      isStandard: true
    };
  }

  // ==================== Main Calculation ====================
  function runCalculation() {
    if (!validateForm()) { return; }

    resultsSection.classList.add("hidden");
    showSpinner();
    hideGlobalError();
    clearFieldErrors();
    state.isHaversine = false;
    state.haversineNote = "";

    // Ensure per-diem data is loaded before proceeding
    loadPerDiemData().then(function () {
      return doCalculation();
    }).catch(function (err) {
      hideSpinner();
      console.error(err);
      showGlobalError("Error: " + (err.message || "Calculation failed. Check zip codes and try again."));
    });
  }

  function doCalculation() {
    var legs = collectLegData();
    var carLegs = [];
    for (var i = 0; i < legs.length; i++) {
      if (legs[i].type === "personal_car" || legs[i].type === "rental_car") {
        carLegs.push(legs[i]);
      }
    }

    // Geocode destination zip for per diem
    var destZ = destZip.value.trim();
    var destGeoPromise = geocodeZip(destZ).then(function (geo) {
      state.destZipGeo = geo;
    });

    // Geocode all car leg zips sequentially with a delay between each to avoid rate limiting
    var carGeoPromise = Promise.resolve();
    var geoCache = {};
    carLegs.forEach(function (leg) {
      carGeoPromise = carGeoPromise.then(function () {
        var p = [];
        if (!geoCache[leg.fromZip]) {
          p.push(geocodeZip(leg.fromZip).then(function (g) { geoCache[leg.fromZip] = g; }));
        }
        if (!geoCache[leg.toZip]) {
          p.push(delay(1100).then(function () { return geocodeZip(leg.toZip); }).then(function (g) { geoCache[leg.toZip] = g; }));
        }
        if (p.length > 0) {
          return Promise.all(p).then(function () { return delay(1100); });
        }
        return delay(1100);
      });
    });

    return Promise.all([destGeoPromise, carGeoPromise])
      .then(function () {
        // Calculate distances for all car legs
        var routePromises = [];
        carLegs.forEach(function (leg) {
          var fromGeo = geoCache[leg.fromZip];
          var toGeo = geoCache[leg.toZip];
          if (fromGeo && toGeo) {
            leg.fromGeo = fromGeo;
            leg.toGeo = toGeo;
            routePromises.push(
              getOSRMRoute(fromGeo.lon, fromGeo.lat, toGeo.lon, toGeo.lat)
                .catch(function () {
                  state.isHaversine = true;
                  state.haversineNote = "Straight-line distances used for some legs.";
                  return {
                    distanceMeters: haversineDistance(fromGeo.lat, fromGeo.lon, toGeo.lat, toGeo.lon),
                    geometry: null
                  };
                })
                .then(function (route) {
                  leg.distanceMeters = route.distanceMeters;
                  leg.polylineCoords = route.geometry ? decodePolyline(route.geometry) : null;
                })
            );
          }
        });

        return Promise.all(routePromises);
      })
      .then(function () {
        // Per diem lookup
        var pd = lookupPerDiemByZip(destZ, startDate.value, endDate.value);
        if (pd) {
          state.perDiemRate = pd.dailyRate;
          state.perDiemLodging = pd.lodging;
          state.perDiemMeals = pd.meals;
          state.perDiemLocation = pd;
          if (pd.totalPerDiem !== undefined) {
            state.lodgingCost = pd.totalLodging;
            state.mealsCost = pd.totalMeals;
            state.perDiemCost = pd.totalPerDiem;
          }
        } else {
          state.perDiemRate = 178;
          state.perDiemLodging = 110;
          state.perDiemMeals = 68;
          state.perDiemLocation = { lodging: 110, meals: 68, dailyRate: 178, locationName: "Standard CONUS Rate", isStandard: true };
        }

        // Calculate day count
        var sP = startDate.value.split("-"), eP = endDate.value.split("-");
        var sd = new Date(Date.UTC(parseInt(sP[0], 10), parseInt(sP[1], 10) - 1, parseInt(sP[2], 10)));
        var ed = new Date(Date.UTC(parseInt(eP[0], 10), parseInt(eP[1], 10) - 1, parseInt(eP[2], 10)));
        state.days = Math.max(1, Math.round((ed - sd) / 86400000) + 1);

        // Fallback per-diem costs if not pre-calculated
        if (!state.perDiemCost) {
          state.lodgingCost = state.perDiemLodging * state.days;
          state.mealsCost = state.perDiemMeals * state.days;
          state.perDiemCost = state.lodgingCost + state.mealsCost;
        }

        // Calculate per-leg costs
        var rate = parseFloat(ratePerMile.value);
        state.transportationTotal = 0;
        state.legs = legs;
        for (var i = 0; i < legs.length; i++) {
          var leg = legs[i];
          leg.totalCost = 0;
          leg.costLabel = "";

          if (leg.type === "personal_car" && leg.distanceMeters) {
            leg.distanceMiles = leg.distanceMeters / 1609.344;
            leg.mileageCost = leg.distanceMiles * rate;
            leg.totalCost = leg.mileageCost;
            leg.costLabel = "Personal Car (" + leg.fromZip + " \u2192 " + leg.toZip + ")";
          } else if (leg.type === "rental_car" && leg.distanceMeters) {
            leg.distanceMiles = leg.distanceMeters / 1609.344;
            leg.mileageCost = leg.distanceMiles * rate;
            leg.rentalCost = leg.dailyRate * leg.rentalDays;
            leg.totalCost = leg.mileageCost + leg.rentalCost;
            leg.costLabel = "Rental Car (" + leg.fromZip + " \u2192 " + leg.toZip + ", " + leg.rentalDays + "d)";
          } else if (leg.type === "flight") {
            leg.totalCost = leg.cost;
            leg.costLabel = "Flight (" + (leg.airline || "Airline") + " " + leg.depCity + " \u2192 " + leg.arrCity + ")";
          } else if (leg.type === "taxi") {
            leg.totalCost = leg.cost;
            leg.costLabel = "Taxi (" + leg.from + " \u2192 " + leg.to + ")";
          }
          state.transportationTotal += leg.totalCost;
        }

        state.totalCost = state.transportationTotal + state.perDiemCost;
        displayResults();
        hideSpinner();
      })
      .catch(function (err) {
        hideSpinner();
        console.error(err);
        showGlobalError("Error: " + (err.message || "Calculation failed. Check zip codes and try again."));
      });
  }

  // ==================== Results Display ====================
  function displayResults() {
    // Summary grid
    var items = [
      { label: "Dates", value: formatDate(startDate.value) + " \u2013 " + formatDate(endDate.value) },
      { label: "Duration", value: state.days + " day" + (state.days !== 1 ? "s" : "") },
      { label: "Destination", value: state.destZipGeo ? state.destZipGeo.displayName : destZip.value },
      { label: "Lodging Rate", value: formatCurrency(state.perDiemLodging) + "/day" + (state.perDiemLocation && state.perDiemLocation.rateNote ? state.perDiemLocation.rateNote : "") },
      { label: "Meals Rate", value: formatCurrency(state.perDiemMeals) + "/day" }
    ];
    var html = "";
    for (var i = 0; i < items.length; i++) {
      html += "<div class=\"summary-item\"><div class=\"summary-label\">" + escapeHtml(items[i].label) + "</div><div class=\"summary-value\">" + escapeHtml(items[i].value) + "</div></div>";
    }
    summaryGrid.innerHTML = html;

    // Disclaimer
    var notes = [];
    if (state.isHaversine) { notes.push("\u26A0\uFE0F " + state.haversineNote); }
    if (state.perDiemLocation && state.perDiemLocation.isStandard) { notes.push("\u2139\uFE0F " + state.perDiemLocation.locationName); }
    disclaimerNotes.innerHTML = notes.length > 0 ? notes.join("<br>") : "";

    // Cost table
    var rows = "";

    // Transportation legs
    for (var j = 0; j < state.legs.length; j++) {
      var leg = state.legs[j];
      rows += "<div class=\"cost-row\">"
        + "<span class=\"cost-label\">" + escapeHtml(leg.costLabel) + "</span>"
        + "<span class=\"cost-value\">" + formatCurrency(leg.totalCost) + "</span>"
        + "</div>";
      // Detailed breakdown for rental car
      if (leg.type === "rental_car" && leg.distanceMiles) {
        rows += "<div class=\"cost-row cost-detail\">"
          + "<span class=\"cost-label\">  Mileage (" + formatDistance(leg.distanceMiles) + " \u00D7 " + formatCurrency(parseFloat(ratePerMile.value)) + ")</span>"
          + "<span class=\"cost-value\">" + formatCurrency(leg.mileageCost) + "</span>"
          + "</div>";
        rows += "<div class=\"cost-row cost-detail\">"
          + "<span class=\"cost-label\">  Rental (" + leg.rentalDays + "d \u00D7 " + formatCurrency(leg.dailyRate) + ")</span>"
          + "<span class=\"cost-value\">" + formatCurrency(leg.rentalCost) + "</span>"
          + "</div>";
      }
    }

    // Transportation subtotal
    rows += "<div class=\"cost-row cost-subtotal\">"
      + "<span class=\"cost-label\">Transportation Subtotal</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.transportationTotal) + "</span>"
      + "</div>";

    // Per diem
    rows += "<div class=\"cost-row\">"
      + "<span class=\"cost-label\">Lodging Cost (" + state.days + " day" + (state.days !== 1 ? "s" : "") + " \u00D7 " + formatCurrency(state.perDiemLodging) + ")</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.lodgingCost) + "</span>"
      + "</div>";
    rows += "<div class=\"cost-row\">"
      + "<span class=\"cost-label\">Meals Cost (" + state.days + " day" + (state.days !== 1 ? "s" : "") + " \u00D7 " + formatCurrency(state.perDiemMeals) + ")</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.mealsCost) + "</span>"
      + "</div>";
    rows += "<div class=\"cost-row cost-subtotal\">"
      + "<span class=\"cost-label\">Per Diem Subtotal</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.perDiemCost) + "</span>"
      + "</div>";

    // Total
    rows += "<div class=\"cost-row total\">"
      + "<span class=\"cost-label\">Total Estimated Cost</span>"
      + "<span class=\"cost-value\">" + formatCurrency(state.totalCost) + "</span>"
      + "</div>";

    costTable.innerHTML = rows;
    resultsSection.classList.remove("hidden");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    renderMap();
  }

  // ==================== Map ====================
  function renderMap() {
    if (state.mapInstance) { state.mapInstance.remove(); state.mapInstance = null; }
    mapDiv.innerHTML = "";

    // Find first car leg with coordinates for map
    var firstCar = null;
    for (var i = 0; i < state.legs.length; i++) {
      var leg = state.legs[i];
      if ((leg.type === "personal_car" || leg.type === "rental_car") && leg.fromGeo && leg.toGeo) {
        firstCar = leg; break;
      }
    }
    if (!firstCar) { return; }

    var map = L.map("map", { attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
      crossOrigin: true, maxZoom: 19
    }).addTo(map);

    var allCoords = [];
    for (var j = 0; j < state.legs.length; j++) {
      var l = state.legs[j];
      if ((l.type === "personal_car" || l.type === "rental_car") && l.fromGeo && l.toGeo) {
        L.marker([l.fromGeo.lat, l.fromGeo.lon]).addTo(map).bindPopup("Start: " + l.fromGeo.displayName);
        L.marker([l.toGeo.lat, l.toGeo.lon]).addTo(map).bindPopup("End: " + l.toGeo.displayName);
        if (l.polylineCoords && l.polylineCoords.length > 0) {
          L.polyline(l.polylineCoords, { color: "#2563eb", weight: 5, opacity: 0.7 }).addTo(map);
          allCoords = allCoords.concat(l.polylineCoords);
        } else {
          allCoords.push([l.fromGeo.lat, l.fromGeo.lon], [l.toGeo.lat, l.toGeo.lon]);
        }
      }
    }

    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] });
    }
    state.mapInstance = map;
    // Defer invalidateSize until the layout has settled
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        map.invalidateSize();
      });
    });
  }

  // ==================== PDF Generation ====================
  function generatePDF(onComplete) {
    try {
      var btn = downloadPdfBtn;
      btn.disabled = true;
      btn.textContent = "Generating PDF...";

      var doc = new jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      var pageWidth = doc.internal.pageSize.getWidth();
      var margin = 15, y = margin, col1X = margin, col2X = margin + 70, lineH = 7;

      doc.setFontSize(18); doc.setTextColor(37, 99, 235);
      doc.text("Trip Cost Report", margin, y); y += 8;
      doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      doc.text("Generated: " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), margin, y); y += 10;
      doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y); y += 10;

      // Trip Details
      doc.setFontSize(12); doc.setTextColor(30, 41, 59); doc.text("Trip Details", margin, y); y += 7;
      doc.setFontSize(9);
      var details = [
        ["Dates:", formatDate(startDate.value) + " to " + formatDate(endDate.value)],
        ["Duration:", state.days + " day" + (state.days !== 1 ? "s" : "")],
        ["Destination:", state.destZipGeo ? state.destZipGeo.displayName : (destZip.value || "N/A")],
        ["Lodging Rate:", formatCurrency(state.perDiemLodging) + "/day"],
        ["Meals Rate:", formatCurrency(state.perDiemMeals) + "/day"]
      ];
      for (var d = 0; d < details.length; d++) {
        doc.setFont(undefined, "bold"); doc.text(details[d][0], col1X, y);
        doc.setFont(undefined, "normal");
        var w = doc.splitTextToSize(details[d][1], pageWidth - col2X);
        doc.text(w, col2X, y); y += lineH * Math.max(1, w.length);
      }
      y += 6;

      // Cost Breakdown
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y); y += 8;
      doc.setFontSize(12); doc.setTextColor(30, 41, 59); doc.text("Cost Breakdown", margin, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);

      // Transportation legs
      for (var j = 0; j < state.legs.length; j++) {
        var leg = state.legs[j];
        var pdfLabel = leg.costLabel.replace(/\u2192/g, "->");
        doc.setFont(undefined, "normal");
        doc.text(pdfLabel + ":", col1X, y);
        doc.text(formatCurrency(leg.totalCost), col2X, y); y += lineH + 1;
      }
      y += 2;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y); y += 4;
      doc.setFont(undefined, "bold");
      doc.text("Transportation Subtotal:", col1X, y);
      doc.text(formatCurrency(state.transportationTotal), col2X, y); y += lineH + 3;

      // Per diem
      doc.setFont(undefined, "normal");
      doc.text("Lodging Cost (" + state.days + " day" + (state.days !== 1 ? "s" : "") + "):", col1X, y);
      doc.text(formatCurrency(state.lodgingCost), col2X, y); y += lineH + 1;
      doc.text("Meals Cost (" + state.days + " day" + (state.days !== 1 ? "s" : "") + "):", col1X, y);
      doc.text(formatCurrency(state.mealsCost), col2X, y); y += lineH + 1;
      y += 2;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y); y += 4;
      doc.setFont(undefined, "bold");
      doc.text("Per Diem Subtotal:", col1X, y);
      doc.text(formatCurrency(state.perDiemCost), col2X, y); y += lineH + 3;

      // Total
      y += 4;
      doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y); y += 7;
      doc.setFontSize(13); doc.setTextColor(37, 99, 235); doc.setFont(undefined, "bold");
      doc.text("Total Estimated Cost:", col1X, y);
      doc.text(formatCurrency(state.totalCost), col2X, y); y += 10;

      // Map
      var firstCarForMap = null;
      for (var k = 0; k < state.legs.length; k++) {
        var l = state.legs[k];
        if ((l.type === "personal_car" || l.type === "rental_car") && l.fromGeo && l.toGeo) { firstCarForMap = l; break; }
      }
      if (firstCarForMap) {
        var zoom = 5;
        var distMiles = firstCarForMap.distanceMiles || 500;
        if (distMiles < 5) zoom = 12; else if (distMiles < 20) zoom = 10;
        else if (distMiles < 75) zoom = 8; else if (distMiles < 250) zoom = 6;
        else if (distMiles < 800) zoom = 5; else if (distMiles < 2000) zoom = 4;

        var clat = (firstCarForMap.fromGeo.lat + firstCarForMap.toGeo.lat) / 2;
        var clon = (firstCarForMap.fromGeo.lon + firstCarForMap.toGeo.lon) / 2;
        var mapUrl = "https://staticmap.openstreetmap.de/staticmap.php"
          + "?center=" + clat.toFixed(5) + "," + clon.toFixed(5)
          + "&zoom=" + zoom + "&size=800x400"
          + "&markers=" + firstCarForMap.fromGeo.lat.toFixed(5) + "," + firstCarForMap.fromGeo.lon.toFixed(5) + ",ol-marker"
          + "|" + firstCarForMap.toGeo.lat.toFixed(5) + "," + firstCarForMap.toGeo.lon.toFixed(5) + ",ol-marker";

        var mapImg = new Image(); mapImg.crossOrigin = "anonymous";
        mapImg.onload = function () {
          var mw = pageWidth - margin * 2, mh = (mapImg.naturalHeight / mapImg.naturalWidth) * mw;
          if (y + mh + 25 > doc.internal.pageSize.getHeight()) { doc.addPage(); y = margin; }
          doc.setFontSize(10); doc.setTextColor(30, 41, 59); doc.setFont(undefined, "bold");
          doc.text("Route Map", margin, y); y += 6;
          doc.addImage(mapImg, "PNG", margin, y, mw, mh); y += mh + 10;
          finishPDF(doc, y, onComplete);
        };
        mapImg.onerror = function () {
          doc.setFontSize(9); doc.setTextColor(148, 163, 184); doc.setFont(undefined, "italic");
          doc.text("(Route map unavailable)", margin, y);
          finishPDF(doc, y + 6, onComplete);
        };
        mapImg.src = mapUrl;
        return;
      }
      finishPDF(doc, y, onComplete);
    } catch (e) {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "\uD83D\uDCE5 Download PDF Report";
      alert("Failed to generate PDF: " + (e.message || "Unknown error"));
    }
  }

  function finishPDF(doc, y, onComplete) {
    var margin = 15;
    if (y + 20 > doc.internal.pageSize.getHeight()) { doc.addPage(); y = margin; }
    doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.setFont(undefined, "italic");
    doc.text("Disclaimer: GSA FY2026 per diem rates. For estimation purposes only.", margin, y); y += 4;
    doc.text("Travel Allowance Calculator v1.0", margin, y);
    var btn = downloadPdfBtn;
    if (onComplete) {
      onComplete(doc.output("blob"));
    } else {
      doc.save("trip-report.pdf");
    }
    btn.disabled = false;
    btn.textContent = "\uD83D\uDCE5 Download PDF Report";
  }

  // ==================== Email ====================
  var EMAILJS_PUBLIC_KEY = "G_plCuyI5GtqvIaCw";
  var EMAILJS_SERVICE_ID = "service_3pg4h95";
  var EMAILJS_TEMPLATE_ID = "template_jhibair";

  var emailSending = false;

  sendEmailBtn.addEventListener("click", function () {
    if (emailSending) { return; }
    var toAddr = emailToAddr.value.trim();
    if (!toAddr || toAddr.indexOf("@") === -1) {
      emailStatus.textContent = "Enter a valid email address.";
      emailStatus.className = "email-status error"; return;
    }
    emailSending = true;
    sendEmailBtn.disabled = true; sendEmailBtn.textContent = "Sending...";
    emailStatus.textContent = ""; emailStatus.className = "email-status";

    var dest = state.destZipGeo ? state.destZipGeo.displayName : (destZip.value || "N/A");
    var subject = "Trip Cost Report - " + destZip.value;

    // Build styled HTML email body
    var rowsHtml = "";
    for (var i = 0; i < state.legs.length; i++) {
      var l = state.legs[i];
      rowsHtml += "<tr><td style='padding:6px 0;border-bottom:1px solid #eee'>" + escapeHtml(l.costLabel) + "</td>"
        + "<td style='padding:6px 0;text-align:right;border-bottom:1px solid #eee;font-weight:600'>" + formatCurrency(l.totalCost) + "</td></tr>";
    }
    rowsHtml += "<tr><td style='padding:6px 0;font-weight:700'>Transportation Subtotal</td>"
      + "<td style='padding:6px 0;text-align:right;font-weight:700'>" + formatCurrency(state.transportationTotal) + "</td></tr>";
    rowsHtml += "<tr><td colspan='2' style='padding:8px 0 0'><hr style='border:none;border-top:1px solid #ddd'></td></tr>";
    rowsHtml += "<tr><td style='padding:6px 0'>Lodging (" + state.days + "d &times; " + formatCurrency(state.perDiemLodging) + ")</td>"
      + "<td style='padding:6px 0;text-align:right;font-weight:600'>" + formatCurrency(state.lodgingCost) + "</td></tr>";
    rowsHtml += "<tr><td style='padding:6px 0;border-bottom:1px solid #eee'>Meals (" + state.days + "d &times; " + formatCurrency(state.perDiemMeals) + ")</td>"
      + "<td style='padding:6px 0;text-align:right;font-weight:600;border-bottom:1px solid #eee'>" + formatCurrency(state.mealsCost) + "</td></tr>";
    rowsHtml += "<tr><td style='padding:6px 0;font-weight:700'>Per Diem Subtotal</td>"
      + "<td style='padding:6px 0;text-align:right;font-weight:700'>" + formatCurrency(state.perDiemCost) + "</td></tr>";
    rowsHtml += "<tr><td colspan='2' style='padding:10px 0 0'><hr style='border:none;border-top:2px solid #2563eb'></td></tr>";
    rowsHtml += "<tr><td style='padding:8px 0;font-size:17px;font-weight:700;color:#2563eb'>Total Estimated Cost</td>"
      + "<td style='padding:8px 0;text-align:right;font-size:20px;font-weight:700;color:#2563eb'>" + formatCurrency(state.totalCost) + "</td></tr>";

    var messageHtml =
      "<div style='max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;color:#1e293b'>"
      + "<h1 style='font-size:22px;color:#2563eb;margin:0 0 4px'>&#x2708;&#xFE0F; Trip Cost Report</h1>"
      + "<p style='font-size:13px;color:#64748b;margin:0 0 20px'>" + formatDate(startDate.value) + " &ndash; " + formatDate(endDate.value) + " &middot; " + escapeHtml(dest) + " &middot; " + state.days + " day" + (state.days !== 1 ? "s" : "") + "</p>"
      + "<table style='width:100%;border-collapse:collapse;font-size:14px'>" + rowsHtml + "</table>"
      + "<p style='font-size:11px;color:#94a3b8;margin:24px 0 0;font-style:italic'>GSA FY2026 per diem rates. For estimation purposes only. &mdash; Travel Allowance Calculator</p>"
      + "</div>";

    emailjs.init(EMAILJS_PUBLIC_KEY);
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: toAddr, subject: subject, message: messageHtml
    }).then(function () {
      emailStatus.textContent = "Report sent to " + toAddr + "!";
      emailStatus.className = "email-status success";
      sendEmailBtn.disabled = false; sendEmailBtn.textContent = "Send";
      emailToAddr.value = "";
      emailSending = false;
    }).catch(function (err) {
      emailStatus.textContent = "Failed: " + (err.text || err.message || "Check EmailJS setup.");
      emailStatus.className = "email-status error";
      sendEmailBtn.disabled = false; sendEmailBtn.textContent = "Send";
      emailSending = false;
    });
  });

  // ==================== Event Listeners ====================
  legsContainer.addEventListener("input", function (e) {
    if (e.target.classList.contains("leg-to-zip")) {
      syncDestZipFromLeg();
    }
  });

  addLegBtn.addEventListener("click", function () {
    try { createLeg("personal_car"); } catch (e) { console.error("Add leg failed:", e); }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    runCalculation();
  });

  downloadPdfBtn.addEventListener("click", function () { generatePDF(); });

  emailResultsBtn.addEventListener("click", function () {
    emailForm.classList.toggle("hidden");
  });
  cancelEmailBtn.addEventListener("click", function () {
    emailForm.classList.add("hidden");
    emailStatus.textContent = ""; emailStatus.className = "email-status";
  });

  newCalcBtn.addEventListener("click", function () { resetAll(); });

  // ==================== Reset ====================
  function resetAll() {
    if (state.mapInstance) { state.mapInstance.remove(); state.mapInstance = null; }
    mapDiv.innerHTML = "";
    state = {
      legs: [], legIdCounter: 0, destZipGeo: null,
      perDiemRate: 0, perDiemLodging: 0, perDiemMeals: 0, perDiemLocation: null,
      lodgingCost: 0, mealsCost: 0, perDiemCost: 0,
      transportationTotal: 0, totalCost: 0, days: 0,
      isHaversine: false, haversineNote: "", mapInstance: null
    };
    legsContainer.innerHTML = "";
    form.reset();
    clearFieldErrors();
    hideGlobalError();
    legsError.textContent = "";
    legsError.classList.remove("visible");
    resultsSection.classList.add("hidden");
    emailForm.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    emailSending = false;
    if (legTemplate) { try { createLeg("personal_car"); } catch (e) { console.error(e); } }
  }

  // ==================== Initialize ====================
  loadPerDiemData();

  if (!legTemplate) {
    console.error("Template #legTemplate not found — legs will not render.");
  } else {
    try { createLeg("personal_car"); } catch (e) { console.error("Initial leg creation failed:", e); }
  }

})();
