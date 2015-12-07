package client

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"path/filepath"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cliconfig"
	"github.com/get3w/get3w/pkg/ioutils"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/pkg/stringutils"
	"github.com/get3w/get3w/repos"
	"github.com/get3w/get3w/storage"
)

// CmdPush pushs an app or a repository to the registry.
//
// Usage: get3w pull [OPTIONS] IMAGENAME[:TAG|@DIGEST]
func (cli *Get3WCli) CmdPush(args ...string) error {
	cmd := Cli.Subcmd("push", []string{"", "URL", "URL DIR"}, Cli.Get3WCommands["push"].Description, true)
	cmd.Require(flag.Max, 2)
	cmd.ParseFlags(args, true)

	url := cmd.Arg(0)
	dir := cmd.Arg(1)

	return cli.push(url, dir)
}

func (cli *Get3WCli) push(url, dir string) error {
	site, err := storage.NewLocalSite(dir)
	if err != nil {
		return err
	}
	config, err := site.GetConfig()
	if err != nil {
		return err
	}

	var repo *get3w.Repository
	if url != "" {
		repo, err = repos.ParseRepository(url)
		if err != nil {
			return err
		}
	} else {
		repo = config.Repository
	}

	if repo == nil || repo.Host == "" || repo.Owner == "" || repo.Name == "" {
		return fmt.Errorf("fatal: repository is unset. use: get3w push URL")
	}

	if cli.configFile.AuthConfig.Username == "" || cli.configFile.AuthConfig.AccessToken == "" {
		fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "push")
		if err := cli.CmdLogin(); err != nil {
			return err
		}
	}

	// TODO: error tips
	if cli.configFile.AuthConfig.Username != repo.Owner {
		return fmt.Errorf("fatal: config file repository")
	}

	// inputAttempt := &get3w.AppPushInput{}
	// resp, err := client.Apps.Push(repo.Owner, repo.Name, inputAttempt)
	// if err != nil && resp.StatusCode == http.StatusUnauthorized {
	// 	fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "push")
	// 	if err = cli.CmdLogin(); err != nil {
	// 		return err
	// 	}
	// } else if err != nil {
	// 	return err
	// }
	client := get3w.NewClient(cli.configFile.AuthConfig.AccessToken)
	output, _, err := client.Apps.FilesChecksum(repo.Owner, repo.Name)
	if err != nil {
		return err
	}
	files := output.Files

	localFiles, err := site.GetAllFiles()
	if err != nil {
		return err
	}

	// 1 specified add, 0 specified edit, -1 specified delete
	pathMap := make(map[string]int)

	for _, localFile := range localFiles {
		if localFile.IsDir {
			continue
		}
		checksum := files[localFile.Path]
		if checksum == "" {
			pathMap[localFile.Path] = 1
		} else {
			localChecksum, _ := site.Checksum(localFile.Path)
			if checksum != localChecksum {
				pathMap[localFile.Path] = 0
			}
		}
	}
	for path := range files {
		if !site.IsExist(path) {
			pathMap[path] = -1
		}
	}

	configPath := cliconfig.ConfigDir()
	gzPath := filepath.Join(configPath, stringutils.UUID()+".tar.gz")

	err = ioutils.Pack(gzPath, site.Path, pathMap)
	if err != nil {
		return err
	}

	data, err := ioutil.ReadFile(gzPath)
	if err != nil {
		return err
	}

	blob := base64.StdEncoding.EncodeToString(data)

	input := &get3w.FilesPushInput{
		Blob: blob,
	}

	for path, val := range pathMap {
		if val < 0 {
			input.Removed = append(input.Removed, path)
		} else if val == 0 {
			input.Updated = append(input.Updated, path)
		} else {
			input.Added = append(input.Added, path)
		}
	}

	fmt.Println(input.Removed)
	fmt.Println(input.Updated)
	fmt.Println(input.Added)

	_, _, err = client.Apps.FilesPush(repo.Owner, repo.Name, input)
	return err
}
