<script>
    export let name;
    export let value;
    export let unit = "";
    export let active = true;
</script>

<div>
    {name}
    <input class="value-input" type="number"  bind:value={value} placeholder="NaN"/>
    {unit}
</div>

<style>
    .value-input {
        width: 100px;
    }
</style>