<script>
    import State from "./State.svelte";
    import ChangeOfState from "./ChangeOfState.svelte";
    import Switch from "./Switch.svelte";
    import List from "./List.svelte";
    import PythonRunner from "./PythonRunner.svelte";

    import { pyodide } from "./stores";

    const colors = ["White", "Red", "Yellow", "Green", "Blue", "Black"]
    let selectedColor;
    const systemTypeOptions = ["closed", "open", "isoliert"];
    let systemType = [];
    let sysType = "open";

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

    function updateInformation(event) {
        console.log("update", event)
    }
</script>

<div class="sidebar">
Sidebar
</div>

<div class="main">
    <h1>Welcome to K+++TD</h1>

    <form>
    <label class="form-section">System</label>
    <div class="wrapper section-entry">
        <Switch label="closed" disabled/>
        <Switch label="in motion" checked={false} disabled/>
        <Switch label="in equilibrium" disabled/>
    </div>
    
    <label class="form-section">Material</label>
    <div class="wrapper section-entry">
        <div class="switch-element">
            <Switch label="ideal gas" disabled/>
        </div>
    </div>
    
    <div class="form-section">
        <label>States</label>
        <input type="button" class="add-btn" value="+" on:click={addState}/>
    </div>
    <div class="section-entry wrapper">
        {#each states as state}
            <List name="State" id={state.id.toString()} variableOptions={stateVariableOptions}/>
            <State id={state.id} />
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