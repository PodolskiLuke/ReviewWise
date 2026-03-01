import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';

@Component({
  selector: 'app-repositories-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './repositories-list.component.html',
  styleUrls: ['./repositories-list.component.scss']
})
export class RepositoriesListComponent implements OnInit {
  repositories: any[] = [];
  filteredRepositories: any[] = [];
  selectedRepo: any = null;
  searchTerm: string = '';
  loading = false;
  error: string | null = null;

  constructor(private api: ReviewWiseApiService) {}

  ngOnInit() {
    this.fetchRepositories();
  }

  fetchRepositories() {
    this.loading = true;
    this.error = null;
    this.api.getRepositories().subscribe({
      next: (repos) => {
        this.repositories = repos;
        this.filteredRepositories = repos;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load repositories.';
        this.loading = false;
      }
    });
  }

  onSearch(term: string) {
    this.searchTerm = term;
    this.filteredRepositories = this.repositories.filter(repo =>
      repo.name.toLowerCase().includes(term.toLowerCase())
    );
  }

  selectRepo(repo: any) {
    this.selectedRepo = repo;
    // You can emit an event or navigate to PRs here
  }
}
