mapfile -t machine_ids < <(fly machine list -q)
for item in "${machine_ids[@]}"; do
    fly machine start "$item"
done