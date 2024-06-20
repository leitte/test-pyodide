<script>
    import List from "./List.svelte";
    import PythonRunner from "./PythonRunner.svelte";
    import { onMount } from "svelte";
    import Ontology from "./Ontology";
    import Concept from "./Concept.svelte";
    import config_thmo from '$lib/config_thmo.json'
    //import Problem1 from '$lib/SampleProblems/Problem1.json'
    import { RuleHandler } from "./RuleHandler";
    import { pyodide } from "./stores";


    function addState() {
        //changeOfState = [...changeOfState, {id: `${states.length},${states.length+1}`}]
        //states = [...states, {id: states.length+1}]
    }

    let showInfo = undefined;
    async function updateInformation(event) {
        console.log("update", event)
        //console.log(await getClassProperties(event.detail.concept))
        //console.log(await getAttributes('System'))
        showInfo = event.detail.variables
    }

    let ontology = null;
    let error = null;

    let world = {}
    let mysys = {};
    let mystate = {};
    let mymat = {};

    let world2 = {};
    let systems = [];

    $: systems = Object.entries(world2).reduce((acc, [key,obj]) => {
        if (obj?.label === "System") {
            acc[key] = obj;
        }
        return obj
    }, {});

    onMount(async () => {
        try {
            //const url = 'https://raw.githubusercontent.com/leitte/test-pyodide/main/static/thermodynamics_concepts.owl.ttl';
            const url = 'https://raw.githubusercontent.com/leitte/test-pyodide/main/src/lib/thermodynamics.owl.ttl'
            ontology = await Ontology.createInstance(url)

            /*
            Object.entries(Problem1).forEach(([className,val]) => {
                console.log(className,val)
                if (Array.isArray(val)) {
                    val.forEach((v) => {
                        console.log("creating object", v)
                        const obj = ontology.createClass(className, v.id)
                        ontology.updateClass(obj, v)
                        console.log(obj)
                        world2[v.id] = obj;
                    })
                }
                else {
                    const obj = ontology.createClass(className, val.id)
                    console.log(obj)
                }
            })
            */

            mysys = ontology.createClass('System', 1);
            ontology.updateClass(mysys, config_thmo.System)
            mystate = ontology.createClass('State', '1');
            mymat = ontology.createClass('PureMaterial', '1');
            ontology.updateClass(mymat, config_thmo.PureMaterial)
            ontology.updateClass(mysys, {state: mystate, material: mymat})
            ontology.updateClass(mystate, {system: mysys})

            console.log("#####", mystate.properties.system.value)

            let idealGasLaw = ontology.createClass('IdealGasLaw', 'igl1')
            console.log("ideal gas law", idealGasLaw);

            world['system'] = {attributes: ontology.attributes('System'),
                               variables: ontology.variables('System')
            }
            world['material'] = {attributes: ontology.attributes('PureMaterial'),
                                 variables: ontology.variables('PureMaterial')
            }
            world['states'] = {S1: {id: 1, 
                                    attributes: ontology.attributes('State'),
                                    variables: ontology.variables('State')
                                },
                                S2: {id: 2, 
                                    attributes: ontology.attributes('State'),
                                    variables: ontology.variables('State')
                                },
                            }

            const ruleHander = new RuleHandler();
        } catch (err) {
            error = err.message;
        }
    });
    //console.log(config_thmo, config_thmo.System.fixed.includes("closed"))
</script>

<div class="sidebar">
Sidebar

{#if showInfo}
    <div class="list">
        {#each Object.keys(showInfo).sort() as v}
            <label>{v}</label>
            <label>{showInfo[v].name} in {showInfo[v].unit}</label>
        {/each}
    </div>
{/if}
</div>

<div class="main">
    <h1>Welcome to K+++TD</h1>

    <!--
    {#if ontology }
        Ontology {ontology.size}
    {:else}
        Loading ontology
    {/if }

    <math xmlns="http://www.w3.org/1998/Math/MathML">
        <mn>23</mn>23
        <msup>
            <mi>x</mi>
            <mn>2</mn>
        </msup>
        a
        <mo>+</mo>
        <msup>
            <mi>y</mi>
            <mn>2</mn>
        </msup>
        <mo>=</mo>
        <msup>
            <mi>z</mi>
            <mn>33</mn>
        </msup>
    </math>

    <math xmlns="http://www.w3.org/1998/Math/MathML">
    <mfrac><mn>x</mn> <mi>a</mi></mfrac>
    </math>
    -->

    <div class="form">
        <!--
        {#if world.system}
            <label class="form-section">System</label>
            <div class="wrapper section-entry">
                {#each Object.keys(world.system.attributes) as attr}
                    <Switch label="{attr}" 
                        checked={world.system.attributes[attr].value}
                        disabled={world.system.attributes[attr].fixed}
                    />
                {/each}
            </div>
            <label />
            <div class="wrapper section-entry">
                {#each Object.entries(world.system.variables) as [v,props]}
                   <VariableItem name={v} bind:value={world.system.variables[v].value} unit={props.unit}/>
                {/each}
            </div>
        {:else}
            Loading ontology.
        {/if}

        {#if world.material}
            <label class="form-section">Material</label>
            <div class="wrapper section-entry">
                {#each Object.keys(world.material.attributes) as attr}
                    <Switch label="{attr}" 
                        checked={world.material.attributes[attr].value}
                        disabled={world.material.attributes[attr].fixed}
                    />
                {/each}
            </div>
            <label />
            <div class="wrapper section-entry">
                {#each Object.entries(world.material.variables) as [v,props]}
                   <VariableItem name={v} bind:value={world.material.variables[v].value} unit={props.unit}/>
                {/each}
            </div>
        {/if}
        -->


        <label class="form-section">Item</label>
        <div class="section-entry wrapper">
            <Concept bind:data={mysys} />
            <Concept bind:data={mymat} />
            <Concept bind:data={mystate} />
        </div>

        <label class="form-section">System & Material</label>
        <div class="section-entry wrapper">
            {#if world.system}
                <List name="System" id={""}
                    attributeOptions={world.system.attributes}
                    variableOptions={world.system.variables}
                    on:info={updateInformation}
                />
            {:else}
                Loading ontology.
            {/if}
            {#if world.material}
                <List name="Material" id={1} 
                    attributeOptions={world.material.attributes}
                    variableOptions={world.material.variables}
                    on:info={updateInformation}
                />
            {/if}
        </div>



        {#if world.states}
            <label class="form-section">States</label>
            <div class="section-entry wrapper">
                {#each Object.entries(world.states) as [state,props]}
                    <List name="State" id={props.id} 
                        attributeOptions={world.states[state].attributes}
                        variableOptions={world.states[state].variables}
                        on:info={updateInformation}
                    />
                {/each}
            </div>
        {/if}

        <!--
    <label />
    {JSON.stringify(world)}
    -->

    <!--
    <label class="form-section">System</label>
    <div class="wrapper section-entry">
        {#await systemAttributes then attr}
            {#each attr as a}
                <Switch label="{a}" 
                    checked={config_thmo?.System?.[a] ?? true}
                    disabled={config_thmo.System.fixed.includes(a)}
                />
            {/each}
        {/await}
    </div>
    
    <label class="form-section">Material</label>
    <div class="wrapper section-entry">
        {#await materialAttributes then attr}
            {#each attr as a}
                <Switch label="{a}" 
                    checked={config_thmo?.Material?.[a] ?? true}
                    disabled={config_thmo.Material?.fixed?.includes(a)}
                />
            {/each}
        {/await}
    </div>
    
    <div class="form-section">
        <label>States</label>
        <input type="button" class="add-btn" value="+" on:click={addState}/>
    </div>
    <div class="section-entry wrapper">

        {#each states as state}
            <List name="State" id={state.id.toString()} variableOptions={stateVariableOptions} on:info={updateInformation}/>

            
        {/each}
    </div>
    -->
    
    <!--
    {#if states.length > 1}
        <label class="form-section">Change of state</label>
        <div class="section-entry wrapper">
            {#each changeOfState as cos}
                <ChangeOfState id={cos.id} on:info={updateInformation}/>
            {/each}
        </div>
    {/if}
            -->

    <label/>

    <!--
        <PythonRunner />
    -->
    

        </div>
</div>

<!--
    {$pyodide}

    <pre style:font-size=".6em">
    {JSON.stringify(mystate, null, 2)}
</pre>
-->


<!--


<p></p>
states {JSON.stringify(states)}

<Tags 
    bind:tags={systemType}
    addKeys={[9]}
    autoComplete={systemTypeOptions}
    onlyAutocomplete={true}
    labelText={"System type"}
    labelShow
    placeholder={"Enter a system type..."}
    />

<p>
    <AutoComplete items="{colors}" bind:selectedItem="{selectedColor}" />

</p>

<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
-->

<style>
    .sidebar {
        height: 100%;
        width: 260px;
        position: fixed;
        z-index: 1;
        top: 0;
        left: 0;
        overflow-x: hidden;
        padding-top: 20px;
        padding-left: 20px;
        background-color: aquamarine;
    }

    .main {

    }

    .form {
        display: grid;
        grid-template-columns: 150px 1fr;
        gap: 25px 15px;
    }

    .form-section {
        grid-column: 1 / 2;
        text-align: right;
    }

    .section-entry {
        grid-column: 2 / 3;
    }

    .add-btn {
        border-radius: 50%;
        width: 1.2em;
        height: 1.2em;
        border: none;
        padding: 1px;
        color: white;
        background-color: #2196F3;
        cursor: pointer;
    }

    .wrapper {
        display: flex;
        flex-direction: row;
        gap: 15px;
        max-width: auto;
        align-items: flex-start;
    }

    .list {
        display: grid;
        grid-template-columns: 50px 1fr;
        gap: 10px 5px;
        font: .8em sans-serif;
    }
</style>