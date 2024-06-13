<script>
    import State from "./State.svelte";
    import ChangeOfState from "./ChangeOfState.svelte";
    import Switch from "./Switch.svelte";
    import List from "./List.svelte";
    import PythonRunner from "./PythonRunner.svelte";
    import { getClassProperties, getAttributes } from "./PythonRunner";
    import config_thmo from '$lib/config_thmo.json'
    import { onMount } from "svelte";
    import Ontology from "./Ontology";


    import { pyodide } from "./stores";
    import { graphStore } from "./PythonRunner";

    const colors = ["White", "Red", "Yellow", "Green", "Blue", "Black"]
    let selectedColor;
    const systemTypeOptions = ["closed", "open", "isoliert"];
    let systemType = [];
    let sysType = "open";

    let systemAttributes = []; // = await getAttributes('System');
    let materialAttributes = [];
    let stateAttributes = [];

    /** @type {import('./$types').PageData} */
	export let data;

    $: {
        $graphStore;
        systemAttributes = getAttributes('System');
        materialAttributes = getAttributes('Material');
        stateAttributes = getAttributes('State');
    }

    /*
    $: attrOptions = initAttributes('State', stateAttributes);

    async function initAttributes(className, stateAttributes) {
        return stateAttributes.reduce((opt, key) => {
            opt[key] = {value: config_thmo?.State?.[a] ?? true,
                        disabled: config_thmo.System?.fixed?.includes(a)
            }
        }, {});
    }
        */

    let states = [{id: 1}];
    let changeOfState = [];

    const stateVariableOptions = {
        p: {value: NaN, unit: "Pascal"},
        T: {value: NaN, unit: "K"},
        V: {value: NaN, unit: "m<sup>3</sup>"}
    };

    function addState() {
        changeOfState = [...changeOfState, {id: `${states.length},${states.length+1}`}]
        states = [...states, {id: states.length+1}]
    }

    async function updateInformation(event) {
        console.log("update", event)
        console.log(await getClassProperties(event.detail.concept))
        console.log(await getAttributes('System'))
    }

    let ontology = null;
    let error = null;

    let world = {}

    onMount(async () => {
        try {
            const url = 'https://raw.githubusercontent.com/leitte/test-pyodide/main/static/thermodynamics_concepts.owl.ttl';
            ontology = await Ontology.createInstance(url)

            world['system'] = {attributes: ontology.attributes('System')}
            world['material'] = {attributes: ontology.attributes('Material')}
            world['states'] = {S1: {attributes: ontology.attributes('State')}}
        } catch (err) {
            error = err.message;
        }
    });
    //console.log(config_thmo, config_thmo.System.fixed.includes("closed"))
</script>

<div class="sidebar">
Sidebar
</div>

<div class="main">
    <h1>Welcome to K+++TD</h1>

    <div>{@html JSON.stringify(data)}</div>

    {#if ontology }
        Ontology {ontology.size}
    {:else}
        Loading ontology
    {/if }

    <form>
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
        {/if}

        {#if world.states}
            <label class="form-section">States</label>
            {#each Object.keys(world.states) as state}
                <List name="State" id="1" attributeOptions={world.states[state].attributes}/>
            {/each}
        {/if}

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
        <!--
        {#await attrOptions then attr}
            {#each attr as a}
                {a}
            {/each}
        {/await}
        -->
        {#each states as state}
            <List name="State" id={state.id.toString()} variableOptions={stateVariableOptions} on:info={updateInformation}/>
            <!--
            <State id={state.id} />
            -->
            
        {/each}
    </div>
    
    {#if states.length > 1}
        <label class="form-section">Change of state</label>
        <div class="section-entry wrapper">
            {#each changeOfState as cos}
                <ChangeOfState id={cos.id} on:info={updateInformation}/>
            {/each}
        </div>
    {/if}

    <label/>
    <PythonRunner />

    {$pyodide}
    </form>
</div>


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
        width: 160px;
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

    form {
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
    }


</style>