$machines = fly machine list --json | ConvertFrom-Json
foreach($machine in $machines){
    $id = $machine.id.ToString.Trim()
    fly machine start $id
}