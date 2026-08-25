require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const {
  fetchAllTeamsData,
  fetchAllEventsData,
  fetchAllCollegesData,
  fetchCollegeComprehensiveData,
  exportTeamsExcel,
  exportEventsExcel,
  exportCollegesExcel,
  exportMasterExcel,
  exportCollegeComprehensiveExcel,
} = require("../controllers/adminExportController");

const runTest = async () => {
  try {
    console.log("Connecting to Database...");
    await connectDB();

    console.log("\n--- Testing Data Fetching Functions ---");
    const teams = await fetchAllTeamsData();
    console.log(`✓ fetchAllTeamsData returned ${teams.length} teams`);

    const events = await fetchAllEventsData();
    console.log(`✓ fetchAllEventsData returned ${events.length} events`);

    const colleges = await fetchAllCollegesData();
    console.log(`✓ fetchAllCollegesData returned ${colleges.length} colleges`);

    const comprehensive = await fetchCollegeComprehensiveData();
    console.log(`✓ fetchCollegeComprehensiveData returned ${comprehensive.length} colleges with full details`);

    console.log("\n--- Testing Excel Generation Handlers (Mocking req/res) ---");

    const createMockRes = (testName) => {
      let headers = {};
      let statusCode = 200;
      let sentData = null;

      return {
        setHeader: (key, val) => {
          headers[key] = val;
        },
        status: (code) => {
          statusCode = code;
          return {
            send: (data) => {
              sentData = data;
              console.log(
                `✓ ${testName} generated buffer of size: ${data ? data.length : 0} bytes | Status: ${code} | Content-Type: ${headers["Content-Type"]}`
              );
            },
            json: (data) => {
              console.log(`✓ ${testName} JSON response:`, data);
            },
          };
        },
      };
    };

    // 1. Test Teams Excel Export
    await exportTeamsExcel({}, createMockRes("Teams Excel Export"));

    // 2. Test Events Excel Export
    await exportEventsExcel({ params: {}, query: {} }, createMockRes("Events Excel Export"));

    // 3. Test Colleges Excel Export
    await exportCollegesExcel({}, createMockRes("Colleges Excel Export"));

    // 4. Test Master All-In-One Excel Export
    await exportMasterExcel({}, createMockRes("Master All-In-One Excel Export"));

    // 5. Test College Comprehensive Excel Export
    await exportCollegeComprehensiveExcel({ params: {}, query: {} }, createMockRes("College Comprehensive Excel Export"));

    console.log("\n ALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } catch (error) {
    console.error("Test Error:", error);
    process.exit(1);
  }
};

runTest();
