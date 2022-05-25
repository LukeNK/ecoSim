const DECODER = [
    // env: the weight of the environment factor to the property
    // offset: if the potential need to be add with the number after decode (only 1 for now)
    // codeLength: the length in the code
    // pos: position offset
    // basic stuff
    {name: 'speed', env: 1, codeLength: 10, pos: -5},
    {name: 'strength', env: 1, codeLength: 10},
    {name: 'friendliness', env: 1, codeLength: 10},
    {name: 'intelligence', codeLength: 10},
    {name: 'outlook', codeLength: 10},
    // actions: chance for the agent to do something (Agent.tick())
    {name : 'doAttack', offset: 1, codeLength: 4},
    {name : 'doMate', offset: 1, codeLength: 4},
    // environment related
    {name: 'nativeEnv', codeLength: 4}, // native environment of the agent, higher usually harsher
    {name: 'envMove', offset: 1, codeLength: 3}, // ability to move to new environment
    // energy related properties
    {name: 'maxEnergy', codeLength: 10},
    {name: 'energyConsumption', codeLength: 5}, // now much energy takes for each tick
    // age in tick
    {name: 'oldAge', offset: 1, codeLength: 10}, // the age where the agent dies, offset so it always > 0
    {name: 'matureAge', codeLength: 9}, // TODO
    {name: 'mateSelection', codeLength: 10}, // how selective is the agent to mate
]
let DECODER_TOTAL = 0;
for (const potential of DECODER) DECODER_TOTAL += potential.codeLength;

class Trait {
    /**
     * Create a new trait and decode it to potentials if possible
     * @param {Boolean[]} p paternal trait
     * @param {Boolean[]} m maternal trait
     */
    constructor(p, m) {
        // check input
        if (!p || !m) throw 'Missing Boolean array for p and m'

        this.paternal = p; this.maternal = m; // save th array
        this.code = []; // Boolean array of the code of the trait
        // code into traits
        for (let l = 0; l < p.length; l++)
            this.code.push(p[l] && m[l]); // false is dominant and true is recessive

        // decode the code in to potentials
        this.potentials = {}; // List of potentials and properties
        for (const potential of DECODER)
            this.potentials[potential.name] = potential.codeLength;
        for (let l = 0, t = 0; l < this.code.length; l += DECODER[t].codeLength, t++) {
            let pCode = ''; // potential code
            for (let l1 = 0; l1 < DECODER[t].codeLength; l1++) pCode += this.code[l + l1]? '1':'0';
            this.potentials[DECODER[t].name] = parseInt(pCode, 2) + (DECODER[t].offset? DECODER[t].offset : 0);
        }
    }
    /**
     * return the Id of the trait
     * @returns {String} the Id
     */
    getId() {
        let out = '';
        let code = [...this.code];
        for (let l = code.length; code.length % 4 != 0; l++) code.push(0);
        for (let l = 0; l < this.code.length; l += 4)
            out += parseInt(this.code.slice(l, l + 4).join(''), 2).toString(16)
        return out;
    }
}

class Agent {
    /**
     * Create a new agent
     * @param {Agent} p Paternal
     * @param {Agent} m Maternal
     * @param {Simulation} sim Simulation reference
     */
    constructor(p, m, sim) {
        if (p && m) {
            this.paternal = p; this.maternal = m;
            this.trait = new Trait(
                p.trait[~~(Math.random() + 0.5)? 'paternal' : 'maternal'],
                m.trait[~~(Math.random() + 0.5)? 'paternal' : 'maternal']
            );
        } else {
            let pCode = [], mCode = [];
            for (let l = 0; l < DECODER_TOTAL; l++) {
                pCode.push(~~(Math.random() + 0.5));
                mCode.push(~~(Math.random() + 0.5));
            }
            this.trait = new Trait(pCode, mCode);
        }
        this.potentials = this.trait.potentials;
        this.properties = {...this.potentials}; // copy the potentials to list as properties
        // extra non-genertic properties
        this.age = 0;
        this.energy = this.properties.maxEnergy;

        // other properties
        this.x = 0; this.y = 0; this.z = 0; // coord
        this.sim = sim; // simulation reference
    }
    preTick() {
        // to make sure that the agent is ready for actions
        this.age++; // increase the age
        this.energy -= this.properties.energyConsumption;

        // check if the agent should die yet
        if (
            this.age > this.properties.oldAge ||
            this.energy < 0
        ) return this.die();

        // calculate the property if the agent is in different environment
        if (this.properties.nativeEnv != this.sim.map[this.x][this.y].environment) {
            let envDiff = this.properties.envMove / Math.abs(this.sim.map[this.x][this.y].environment - this.properties.nativeEnv);
            if (envDiff == Infinity) envDiff = 1; // controversial math
            for (const p of DECODER) {
                if (!p.env) continue; // skip properties without env
                this.properties[p.name] *= (envDiff * p.env);
                this.properties[p.name] = Math.round(this.properties[p.name]); // round because float suck
            }
        }
    }
    /**
     * Function that run for each tick to determine which action the agent will do
     */
    tick() {
        // generate decision randomly
        let totalDecision = 0;
        for (const key in this.properties) {
            if (!['doAttack', 'doMate'].includes(key)) continue; // only get necessary variable
            totalDecision += this.properties[key];
        }
        let decision = Math.random() * totalDecision;
        // check if more energy is needed
        if (this.properties.energyConsumption > this.energy) {
            // prioritize for necessary situation
            this.attack(this.sim.getRandomAgent(this));
        } else  {

        }
    }
    /**
     * Attack an agent
     * @param {Agent} target agent to attack
     */
    attack(target) {
        if (this.properties.speed < target.properties.speed) target.energy -= this.properties.speed;
        else if (this.properties.speed == target.properties.speed && this.properties.intelligence < target.properties.intelligence) {
            this.energy -= this.properties.speed;
            target.energy -= target.properties.speed;
        } else this.fight(target);
    }
    /**
     * Continuation of attack()
     * @param {Agent} target Agent to fight with
     */
    fight(target) {
        this.energy -= this.properties.speed; target.energy -= target.properties.speed; // reduce energy
        // calulate stats
        let thisTotal = 0, targetTotal = 0;
        for (const key in this.properties) {
            if (!['speed', 'strength', 'intelligence'].includes(key)) continue; // only get necessary variable
            thisTotal += this.properties[key];
            targetTotal += target.properties[key];
        }
        if (thisTotal - targetTotal >= 0) {
            this.energy += target.energy;
            target.energy = 0; // flag to die
        } else {
            target.energy += this.energy;
            this.energy = 0; // flag to die
        }
    }
    /**
     * Mate with an agent
     * @param {Agent} target Agent to mate with
     * @returns {Agent | false} Return the child, or false if unable to mate
     */
    mate(target) {
        let notFit = false;
        for (const key in target.properties) {
            if (['mateSelection', 'energyConsumption', 'maxEnergy'].includes(key)) continue; // element to skip
            const element = target.properties[key];
            if (
                Math.abs(element - this.properties[key]) > this.properties.mateSelection &&
                Math.abs(element - this.properties[key]) > target.properties.mateSelection
            ) { notFit = true; break }
        }
        if (notFit) return false;
        let child = new Agent(this, target, this.sim); // give birth to the new child
        this.sim.newAgent(child, this.x, this.y);
        return child; // return back, careful not to to repeat newAgent() process again
    }
    /**
     * Move to a location
     * @param {Number} x
     * @param {Number} y
     */
    move(x, y) {
        this.sim.rmAgent(this); // delete from current position
        this.sim.newAgent(this, x, y); // move to new place
    }
    die() {
        // nope there is no better name
        this.sim.rmAgent(this, true);
    }
}

class Simulation {
    /**
     * Create a new simulation
     * @param {Number} width width (x)
     * @param {Number} height height (y)
     * @param {Agent[]} agents array of agent to create
     */
    constructor(width, height, agents) {
        this.width = width; this.height = height;
        // create a map and HTML to write
        this.map = []; let outHTML = '';
        // Pushing is in reverse to preserve [x][y]
        for (let l1 = 0; l1 < width; l1++) {
            this.map.push([]);
            outHTML += '<tr>';
            for (let l2 = 0; l2 < height; l2++) {
                this.map[l1].push({
                    environment: ~~(Math.random()*16), // environment code
                    agents: [], // list of agents in the chunk
                });
                let e = this.map[l1][l2].environment;
                outHTML += `<td id="td${l1}-${l2}">${e < 10? '0' + e: e}</td>`;
            }
            outHTML += '</tr>';
        }
        document.getElementById('map').innerHTML = outHTML; // update


        if (!agents) return;
        // Add agents randomly
        for (const agent of agents)
            this.map[~~(Math.random * width)][~~(Math.random * height)].agents.push(agent);
    }
    tick() {
        // run for every tick of the simulation
        for (const x of this.map)
            for (const y of x)
                for (const agent of y.agents) agent.preTick()
    }
    /**
     * Handle the process to add agent to the simulation
     * @param {Agent} agent agent to add
     * @param {Number} x coordinate
     * @param {Number} y coordinate
     */
    newAgent(agent, x, y) {
        agent.sim = this;
        agent.x = x; agent.y = y;
        agent.z = this.map[x][y].agents.length;
        this.map[x][y].agents.push(agent); // must be last because push()
    }
    /**
     * Remove agent reference from their current location
     * @param {Agent} a agent to remove
     * @param {Boolean} reset reset the location properties in agent to undefined (include Agent.sim)
     */
    rmAgent(a, reset) {
        this.map[a.x][a.y].agents.splice(a.z, 1);
        if (reset) {
            a.x = undefined, a.y = undefined, a.z = undefined;
            a.sim = undefined;
        }
    }
    /**
     * Request another agent in the same chunk, or get entirely random agent if agent is blank. Return agent that was selected.
     * @param {Agent} agent Agent that request
     * @returns {Agent} Agent that was selected
     */
    getRandomAgent(agent) {
        if (agent) {
            let targetZ = agent.z;
            while (targetZ == agent.z)
                targetZ = ~~(Math.random() * this.map[agent.x][agent.y].agents.length);
            return this.map[agent.x][agent.y].agents[targetZ]
        }
    }
}