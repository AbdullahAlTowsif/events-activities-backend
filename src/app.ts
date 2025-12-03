import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from "cookie-parser"
import { envVars } from './app/config/env';
import notFound from './app/middlewares/notFound';
import router from './app/routes';
import { PaymentController } from './app/modules/payment/payment.controller';

const app: Application = express();


app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.post(
    "/api/payment/stripe/webhook",
    express.raw({ type: "application/json" }),
    PaymentController.stripeWebhook
);
//parser
app.use(express.json());
app.use(cookieParser());

app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.get('/', (req: Request, res: Response) => {
    res.send({
        message: "Events & Activities Server is running..",
        environment: envVars.NODE_ENV,
        uptime: process.uptime().toFixed(2) + " sec",
        timeStamp: new Date().toISOString()
    })
});


// app.use(globalErrorHandler);

app.use(notFound);

export default app;