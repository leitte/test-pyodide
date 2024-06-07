<script>
    export let label = "";
    export let checked = true;
    export let disabled = true;
</script>

<div class="switch-element" class:disabled>
    <label class="switch">
        <input type="checkbox" checked='{checked}' disabled='{disabled}'>
        <span class="slider round"></span>
    </label>
    {label}
</div>

<style>
    /* The switch - the box around the slider */
    .switch {
        position: relative;
        display: inline-block;
        width: 30px;
        height: 20px;
    }

    .disabled .slider {
        cursor: not-allowed;
    }

    .switch-element:not(.disabled) .slider {
        cursor: pointer;
    }

    /* Hide default HTML checkbox */
    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    input[disabled] {
        cursor: not-allowed;
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