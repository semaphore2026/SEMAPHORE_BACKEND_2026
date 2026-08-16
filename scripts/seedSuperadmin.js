require("dotenv").config();
const connectDB = require("../config/db");
const Admin = require("../models/Admin");

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    const email = "semaphore2026@gmail.com";
    const password = "mca@9988";
    const name = "Super Admin";
    const role = "superadmin";

    let superAdmin = await Admin.findOne({ email });

    if (superAdmin) {
      console.log(`[SEED] Admin with email '${email}' already exists.`);
      superAdmin.name = name;
      superAdmin.role = role;
      superAdmin.password = password; // pre-save hook will hash it if modified
      await superAdmin.save();
      console.log(`[SEED] Updated superadmin account details successfully.`);
    } else {
      superAdmin = await Admin.create({
        name,
        email,
        password,
        role,
      });
      console.log(`[SEED] Superadmin account created successfully!`);
    }

    console.log(`[SEED] Details:`);
    console.log(`       ID: ${superAdmin._id}`);
    console.log(`       Name: ${superAdmin.name}`);
    console.log(`       Email: ${superAdmin.email}`);
    console.log(`       Role: ${superAdmin.role}`);

    process.exit(0);
  } catch (error) {
    console.error(`[SEED ERROR] Failed to seed superadmin:`, error);
    process.exit(1);
  }
};

seedSuperAdmin();
