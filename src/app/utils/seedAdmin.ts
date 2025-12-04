/* eslint-disable no-console */
import { envVars } from "../config/env";
import bcryptjs from "bcryptjs";
// import { prisma } from "./prisma";
import { Gender, UserRole } from "@prisma/client";
import prisma from "./prisma";

export const seedAdmin = async () => {
    try {
        // Check if admin already exists in Admin table
        const isAdminExist = await prisma.admin.findFirst({
            where: {
                email: envVars.ADMIN_EMAIL
            }
        });
        
        if (isAdminExist) {
            console.log("Admin Already Exists!");
            return;
        }

        console.log("Trying to create admin...");

        const hashedPassword = await bcryptjs.hash(envVars.ADMIN_PASSWORD, Number(envVars.BCRYPT_SALT_ROUND));

        // First, create the Person record
        const person = await prisma.person.create({
            data: {
                email: envVars.ADMIN_EMAIL,
                password: hashedPassword,
                role: UserRole.ADMIN,
                // Create the admin record in the same transaction
                admin: {
                    create: {
                        name: "Admin",
                        password: hashedPassword,
                        role: UserRole.ADMIN,
                        gender: Gender.MALE,
                        contactNumber: "01641413635",
                        address: "Planet Earth", // Added required address field
                        interests: ["Managing Events & Actitvities"] // Added required interests array
                    }
                }
            },
            include: {
                admin: true
            }
        });

        console.log("Admin created Successfully! \n");
        console.log(person.admin);

    } catch (error) {
        console.log("Error creating admin:", error);
    }
};
