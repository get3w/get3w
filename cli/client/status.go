package client

import (
	"fmt"

	"github.com/get3w/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdStatus show the working app status.
//
// Usage: get3w status
func (cli *Get3WCli) CmdStatus(args ...string) error {
	cmd := Cli.Subcmd("status", []string{"", "DIR"}, Cli.Get3WCommands["status"].Description, true)
	cmd.Require(flag.Max, 1)
	cmd.ParseFlags(args, true)

	dir := cmd.Arg(0)

	return cli.status(dir)
}

func (cli *Get3WCli) status(dir string) error {
	authConfig := &cli.config.AuthConfig

	parser, err := storage.NewLocalParser(authConfig.Username, dir)
	if err != nil {
		return err
	}

	if authConfig.Username == "" || authConfig.AccessToken == "" {
		fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "status")
		authConfig, err = cli.login("", "")
		if err != nil {
			return err
		}
	} else {
		fmt.Fprintf(cli.out, "\nYour Username:%s\n", authConfig.Username)
	}

	host := get3w.DefaultRepositoryHost()
	owner := authConfig.Username
	name := parser.Name

	client := get3w.NewClient(authConfig.AccessToken)
	output, _, err := client.Apps.FilesChecksum(owner, name)
	if err != nil {
		return err
	}
	files := output.Files

	localFiles, err := parser.Storage.GetAllFiles(parser.Storage.GetSourcePrefix(""))
	if err != nil {
		return err
	}

	// 1 specified add, 0 specified edit, -1 specified delete
	pathMap := make(map[string]int)

	for _, localFile := range localFiles {
		if localFile.IsDir || parser.IsLocalFile(localFile) {
			continue
		}
		checksum := files[localFile.Path]
		if checksum == "" {
			pathMap[localFile.Path] = 1
		} else {
			localChecksum, _ := parser.Storage.Checksum(localFile.Path)
			if checksum != localChecksum {
				pathMap[localFile.Path] = 0
			}
		}
	}
	for path := range files {
		if !parser.Storage.IsExist(path) {
			pathMap[path] = -1
		}
	}

	fmt.Fprintf(cli.out, "Local repository: %s\n", parser.Path)
	fmt.Fprintf(cli.out, "Remote repository: %s/%s/%s\n", host, owner, name)
	//Your branch is up-to-date with 'origin/master'.

	if len(pathMap) == 0 {
		fmt.Fprintln(cli.out, "Everything up-to-date")
		return nil
	}

	fmt.Fprintln(cli.out, "Diff:")

	for path, val := range pathMap {
		if val > 0 {
			fmt.Fprintf(cli.out, "\t+added:%s\n", path)
		}
	}
	for path, val := range pathMap {
		if val < 0 {
			fmt.Fprintf(cli.out, "\t-removed:%s\n", path)
		}
	}
	for path, val := range pathMap {
		if val == 0 {
			fmt.Fprintf(cli.out, "\tmodified:%s\n", path)
		}
	}

	return nil
}
