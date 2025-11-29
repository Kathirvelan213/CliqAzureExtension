const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { getAppStatus } = require("./src/azureClient");

const app = express();
app.use(cors());
app.use(express.json());

// Default route
app.get("/", (req, res) => {
    res.send({ message: "Azure Cliq Backend is running" });
});

// MAIN ENDPOINT: /appstatus
app.get("/appstatus", async (req, res) => {
    try {
        const appName = req.query.app;

        if (!appName) {
            return res.status(400).json({
                error: "Missing parameter: app"
            });
        }

        const status = await getAppStatus(appName);

        res.json({
            ok: true,
            data: status
        });

    } catch (err) {
        res.status(500).json({
            ok: false,
            error: err.message || "Unknown error"
        });
    }
});

// PORT for Azure Web Apps
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
