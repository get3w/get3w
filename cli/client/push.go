package client

import (
	"fmt"

	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdPush pushs an app or a repository to the registry.
//
// Usage: get3w push [OPTIONS] URL DIR
func (cli *Get3WCli) CmdPush(args ...string) error {
	cmd := Cli.Subcmd("push", []string{"", "DIR"}, Cli.Get3WCommands["push"].Description, true)
	cmd.Require(flag.Max, 2)
	cmd.ParseFlags(args, true)

	dir := cmd.Arg(0)

	return cli.push(dir)
}

func (cli *Get3WCli) push(dir string) error {
	parser, err := storage.NewLocalParser(cli.config.AuthConfig.Username, dir)
	if err != nil {
		return err
	}

	authConfig := &cli.config.AuthConfig

	shouldLogin, err := parser.Push(authConfig, cli.out)
	if shouldLogin {
		fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "push")
		authConfig, err = cli.login("", "")
		if err != nil {
			return err
		}

		_, err = parser.Push(authConfig, cli.out)
		if err != nil {
			return err
		}
	} else if err != nil {
		return err
	}

	return nil

	// var repo *get3w.Repository
	// if url != "" {
	// 	repo, err = repos.ParseRepository(url)
	// 	if err != nil {
	// 		return err
	// 	}
	// } else {
	// 	repo = parser.Config.Repository
	// 	if repo == nil || repo.Host == "" || repo.Owner == "" || repo.Name == "" {
	// 		//fmt.Fprintln(cli.out, "WARNING: repository is unset.")
	// 		repo = &get3w.Repository{
	// 			Host:  get3w.DefaultRepositoryHost(),
	// 			Owner: authConfig.Username,
	// 			Name:  parser.Name,
	// 		}
	// 	}
	// }
	//
	// if repo == nil || repo.Host == "" || repo.Owner == "" || repo.Name == "" {
	// 	return fmt.Errorf("ERROR: remote repository invalid. use: get3w push URL")
	// }
	//
	// if authConfig.Username == "" || authConfig.AccessToken == "" || authConfig.Username != repo.Owner {
	// 	fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "push")
	// 	authConfig, err = cli.login("", "")
	// 	if err != nil {
	// 		return err
	// 	}
	// }
	//
	// if authConfig.Username != repo.Owner {
	// 	return fmt.Errorf("ERROR: Authentication failed for '%s'\n", url)
	// }
	//
	// client := get3w.NewClient(authConfig.AccessToken)
	// output, _, err := client.Apps.FilesChecksum(repo.Owner, repo.Name)
	// if err != nil {
	// 	return err
	// }
	// files := output.Files
	//
	// localFiles, err := parser.Storage.GetAllFiles(parser.Storage.GetSourcePrefix(""))
	// if err != nil {
	// 	return err
	// }
	//
	// // 1 specified add, 0 specified edit, -1 specified delete
	// pathMap := make(map[string]int)
	//
	// for _, localFile := range localFiles {
	// 	if localFile.IsDir || parser.IsLocalFile(localFile) {
	// 		continue
	// 	}
	// 	checksum := files[localFile.Path]
	// 	if checksum == "" {
	// 		pathMap[localFile.Path] = 1
	// 	} else {
	// 		localChecksum, _ := parser.Storage.Checksum(localFile.Path)
	// 		if checksum != localChecksum {
	// 			pathMap[localFile.Path] = 0
	// 		}
	// 	}
	// }
	// for path := range files {
	// 	if !parser.Storage.IsExist(path) {
	// 		pathMap[path] = -1
	// 	}
	// }
	//
	// fmt.Fprintf(cli.out, "Remote repository: %s/%s/%s\n", repo.Host, repo.Owner, repo.Name)
	//
	// if len(pathMap) == 0 {
	// 	fmt.Fprintln(cli.out, "Everything up-to-date")
	// 	return nil
	// }
	//
	// configPath := config.ConfigDir()
	// gzPath := filepath.Join(configPath, stringutils.UUID()+".tar.gz")
	//
	// err = ioutils.Pack(gzPath, parser.Path, pathMap)
	// if err != nil {
	// 	return err
	// }
	//
	// data, err := ioutil.ReadFile(gzPath)
	// if err != nil {
	// 	return err
	// }
	// os.Remove(gzPath)
	//
	// blob := base64.StdEncoding.EncodeToString(data)
	//
	// input := &get3w.FilesPushInput{
	// 	Blob: blob,
	// }
	//
	// for path, val := range pathMap {
	// 	if val > 0 {
	// 		fmt.Fprintf(cli.out, "\t+added:%s\n", path)
	// 		input.Added = append(input.Added, path)
	// 	}
	// }
	// for path, val := range pathMap {
	// 	if val < 0 {
	// 		fmt.Fprintf(cli.out, "\t-removed:%s\n", path)
	// 		input.Removed = append(input.Removed, path)
	// 	}
	// }
	// for path, val := range pathMap {
	// 	if val == 0 {
	// 		fmt.Fprintf(cli.out, "\tmodified:%s\n", path)
	// 		input.Modified = append(input.Modified, path)
	// 	}
	// }
	//
	// _, _, err = client.Apps.FilesPush(repo.Owner, repo.Name, input)
	// if err != nil {
	// 	return err
	// }
	//
	// fmt.Fprintln(cli.out, "done.")
	// return nil
}
