<script>
    import AutoComplete from "simple-svelte-autocomplete"
    import Tags from "svelte-tags-input";
    import State from "./State.svelte";
    import ChangeOfState from "./ChangeOfState.svelte";

    const colors = ["White", "Red", "Yellow", "Green", "Blue", "Black"]
    let selectedColor;
    const systemTypeOptions = ["closed", "open", "isoliert"];
    let systemType = [];
    let sysType = "open";

    let states = [{id: 1}];
    let changeOfState = [];

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
    <h1>Welcome to KnowTD</h1>

    <form>
    <label class="form-section">System</label>
    <div class="wrapper section-entry">
        <div class="switch-element">
            <label class="switch">
                <input type="checkbox" checked disabled>
                <span class="slider round"></span>
            </label>
            closed
        </div>
        <div class="switch-element">
            <label class="switch">
                <input type="checkbox" disabled>
                <span class="slider round"></span>
            </label>
            in motion
        </div>
        <div class="switch-element">
            <label class="switch">
                <input type="checkbox" checked disabled>
                <span class="slider round"></span>
            </label>
            in equilibrium
        </div>
    </div>
    
    <label class="form-section">Material</label>
    <div class="wrapper section-entry">
        <div class="switch-element">
            <label class="switch">
                <input type="checkbox" checked disabled>
                <span class="slider round"></span>
            </label>
            ideal gas
        </div>
    </div>
    
    <div class="form-section">
        <label>States</label>
        <input type="button" class="add-btn" value="+" on:click={addState}/>
    </div>
    <div class="section-entry wrapper">
        {#each states as state}
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

    .btn-group button {
    background-color: #04AA6D; /* Green background */
    border: 1px solid green; /* Green border */
    color: white; /* White text */
    padding: 10px 24px; /* Some padding */
    cursor: pointer; /* Pointer/hand icon */
    float: left; /* Float the buttons side by side */
    }

    .btn-group button:not(:last-child) {
    border-right: none; /* Prevent double borders */
    }

    /* Clear floats (clearfix hack) */
    .btn-group:after {
    content: "";
    clear: both;
    display: table;
    }

    /* Add a background color on hover */
    .btn-group button:hover {
    background-color: #3e8e41;
    }

    .wrapper {
        display: flex;
        flex-direction: row;
        gap: 15px;
        max-width: auto;
    }

    /* The switch - the box around the slider */
.switch {
  position: relative;
  display: inline-block;
  width: 30px;
  height: 20px;
}

/* Hide default HTML checkbox */
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

/* The slider */
.slider {
  position: absolute;
  /*cursor: pointer;*/
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  -webkit-transition: .4s;
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 15px;
  width: 15px;
  left: 3px;
  bottom: 2.5px;
  background-color: white;
  -webkit-transition: .4s;
  transition: .4s;
}

input:checked + .slider {
  background-color: #2196F3;
}

input:focus + .slider {
  box-shadow: 0 0 1px #2196F3;
}

input:checked + .slider:before {
  -webkit-transform: translateX(9px);
  -ms-transform: translateX(9px);
  transform: translateX(9px);
}

/* Rounded sliders */
.slider.round {
  border-radius: 34px;
}

.slider.round:before {
  border-radius: 50%;
}
</style>