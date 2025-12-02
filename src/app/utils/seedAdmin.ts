/* eslint-disable no-console */
import { envVars } from "../config/env";
import bcryptjs from "bcryptjs";
import { prisma } from "./prisma";
import { IJWTPayload } from "../interfaces/common";
import { Gender, UserRole } from "@prisma/client";

export const seedAdmin = async () => {
    try {
        const isAdminExist = await prisma.admin.findFirst({
            where: {
                email: envVars.ADMIN_EMAIL
            }
        })
        if (isAdminExist) {
            console.log("Admin Already Exists!");
            return;
        }

        console.log("Trying to create admin...");

        const hashedPassword = await bcryptjs.hash(envVars.ADMIN_PASSWORD, Number(envVars.BCRYPT_SALT_ROUND));

        const payload = {
            name: "Admin",
            role: UserRole.ADMIN,
            email: envVars.ADMIN_EMAIL,
            password: hashedPassword,
            gender: Gender.MALE,
            contactNumber: "01641413635"
        }

        const admin = await prisma.admin.create({ data: payload })
        console.log("Admin created Successfully! \n");
        console.log(admin);

    } catch (error) {
        console.log(error);
    }
}
