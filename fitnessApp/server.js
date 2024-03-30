const express = require('express');
const redis = require('redis');
const util = require('util');
const app = express();
const port = 3000;


// Konfiguriere den Redis-Client
const client = redis.createClient({
    url: 'redis://redis:6379'
});

client.on('error', (err) => console.log('Redis Client Error', err));

// Initialisiere Beispieldaten
const sampleData = {
    'user1': JSON.stringify({
        steps: 0,
        calories: 0,
        distance: 0,
        rewards: "", 
        currentActivity: "" 
    }),
    'user2': JSON.stringify({
        steps: 0,
        calories: 0,
        distance: 0,
        rewards: "", 
        currentActivity: "" 
    })
};


// Beim Start des Servers Beispieldaten in Redis einfügen
client.connect().then(async () => {
    console.log('Connected to Redis');
    for (const [key, value] of Object.entries(sampleData)) {
        try {
            await client.set(key, value);
            console.log(`Data for ${key} set successfully.`);
        } catch (error) {
            console.error(`Error setting data for ${key}: ${error}`);
        }
    }
});



app.get('/data/:userId', async (req, res) => {
    const { userId } = req.params;
    const data = await client.get(userId);
    if (data) {
        res.send(JSON.parse(data));
    } else {
        res.status(404).send('User not found');
    }
});



app.use(express.static('public')); // Dient statische Dateien aus dem 'public'-Verzeichnis

const clients = []; // Speichert aktive Clients
let isActivityRunning = false; // Variable, um den Status der Aktivität zu speichern 



// Route für Server-Sent Events
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Funktion zum Senden von Nachrichten an den Client
    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);

    // Bei Verbindungsabbruch Client entfernen
    req.on('close', () => {
        console.log(`${clientId} Connection closed`);
        clients.splice(clients.indexOf(newClient), 1);
    });
});

app.post('/toggleActivity', (req, res) => { 
    isActivityRunning = !isActivityRunning; // Wechselt den Status der Aktivität
    res.sendStatus(200);
});



app.post('/setActivity', express.json(), (req, res) => { 
    currentActivity = req.body.activity; // Aktualisiere die aktuelle Aktivität
    res.sendStatus(200);
});


app.post('/inputData', express.json(), async (req, res) => { 
    const { steps, calories, distance } = req.body;

    // Überprüfen Sie, ob alle erforderlichen Daten vorhanden sind
    if (!steps || !calories || !distance) {
        res.status(400).send('Missing data');
        return;
    }

    // Hole die aktuellen Daten des Benutzers
    const currentData = await client.get(USER_ID);


    const newData = {
        steps,
        calories,
        distance,
        timestamp: "", // Leerer Zeitstempel
        rewards: "", // Leere Belohnungen
        activity: "" // Aktivität aus den aktuellen Daten oder leer, wenn keine vorhanden sind
    };




    // Speichere die aktualisierten Daten in Redis
    await client.set(USER_ID, JSON.stringify(newData));

    // Informiere alle SSE-Clients über das Update
    sendEventsToAll(newData);
    res.sendStatus(200);
});





// Eine Beispiel-Funktion, die zufällige Fitnessdaten generiert und an alle Clients sendet
function sendEventsToAll(newData) {
    clients.forEach(client =>
        client.res.write(`data: ${JSON.stringify(newData)}\n\n`)
    );
}








const USER_ID = 'user1'; // Beispiel-UserID, passe dies entsprechend an

async function updateSteps(userId) {

    if (!isActivityRunning) { 
        return; // Beendet die Funktion, wenn keine Aktivität läuft
    }
    
    // Zufällige Erhöhung der Schritte zwischen 5 und 20
    const stepsToAdd = Math.floor(Math.random() * 16) + 5;

    // Hole die aktuellen Schritte des Benutzers aus Redis
    const currentData = await client.get(userId);
    let newData;
    if (currentData) {
        // Parse die aktuellen Daten, wenn vorhanden
        const parsedData = JSON.parse(currentData);
        // Aktualisiere die Schritte, Kalorien und Distanz
        const newSteps = parsedData.steps + stepsToAdd;
        const newCalories = parseFloat((newSteps * 0.04).toFixed(2)); // Kalorien gesamt
        const newDistance = parseFloat((newSteps * 0.5).toFixed(2)); // Distanz in Metern gesamt


        let rewards = parsedData.rewards || ""; // Setze rewards auf einen leeren String, wenn parsedData.rewards nicht definiert ist    

         // Überprüfe, ob die Schritte größer als 10.000 
         if (newDistance >= 5000 && newDistance < 10000) {
            rewards = "5k Distance";
        } else if (newDistance >= 10000 && newDistance < 20000) {
            rewards = "10k Distance";
        } else if (newDistance >= 20000 && newDistance < 21097) {
            rewards = "20k Distance";
        } else if (newDistance >= 21097 && newDistance < 42195) {
            rewards = "Half Marathon";
        } else if (newDistance >= 42195) {
            rewards = "Marathon";
        }


        const options = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Europe/Berlin',
            hour12: false
        };
        // Korrekter Zeitstempel unter Verwendung der Options
        const timestamp = new Date().toLocaleTimeString('de-DE', options);
        newData = {
            steps: newSteps,
            calories: newCalories,
            distance: newDistance,
            timestamp: timestamp, // Verwende den korrekt formatierten Zeitstempel
            rewards: rewards,
            activity: currentActivity 
        };
    } else {
        // Setze neue Daten, wenn noch keine vorhanden sind
        const initialCalories = parseFloat((stepsToAdd * 0.04).toFixed(2));
        const initialDistance = parseFloat((stepsToAdd * 0.5).toFixed(2));
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Europe/Berlin',
            hour12: false
        };
        // Korrekter Zeitstempel auch für den Fall, dass noch keine Daten vorhanden sind
        const timestamp = new Date().toLocaleTimeString('de-DE', options);
        newData = {
            steps: stepsToAdd,
            calories: initialCalories,
            distance: initialDistance,
            timestamp: timestamp, // Verwende den korrekt formatierten Zeitstempel
            rewards: rewards, 
            activity: currentActivity 
        };
    }

    // Speichere die aktualisierten Daten in Redis
    await client.set(userId, JSON.stringify(newData)); 



    // Informiere alle SSE-Clients über das Update
    sendEventsToAll(newData);
}
 

// Starte die regelmäßige Aktualisierung
setInterval(() => {
    updateSteps(USER_ID).catch(console.error);
}, 5000); // Aktualisiere alle 5 Sekunden


app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
